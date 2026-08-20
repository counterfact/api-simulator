"""Scenario-scoped support for product-level Counterfact journeys."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import tempfile
import time
from typing import Callable

import requests


REPO_ROOT = Path(__file__).resolve().parents[2]
COUNTERFACT_BIN = REPO_ROOT / "packages" / "counterfact" / "bin" / "counterfact.js"
REQUEST_TIMEOUT = 10
STARTUP_TIMEOUT = 30
RELOAD_TIMEOUT = 30
PROMPT = "⬣> ".encode()
ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def strip_terminal_control(text: str) -> str:
    return ANSI_ESCAPE.sub("", text).replace("\r", "")


class ReplTerminal:
    """Drive the user-facing REPL and retain its full transcript for failures."""

    def __init__(self, process_id: int, terminal: int):
        self.process_id = process_id
        self.terminal = terminal
        self.output = bytearray()

    def transcript(self) -> str:
        return strip_terminal_control(self.output.decode(errors="replace"))

    def wait_for(self, expected: bytes | str, timeout: float, start: int = 0) -> int:
        import select

        if isinstance(expected, str):
            expected = expected.encode()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            found = self.output.find(expected, start)
            if found >= 0:
                return found
            readable, _, _ = select.select([self.terminal], [], [], 0.25)
            if not readable:
                continue
            try:
                self.output.extend(os.read(self.terminal, 4096))
            except OSError:
                break
        raise AssertionError(
            f"REPL did not emit {expected!r} within {timeout} seconds.\n"
            f"Terminal transcript:\n{self.transcript()}"
        )

    def command(self, command: str, timeout: float = 10) -> str:
        import select

        start = len(self.output)
        os.write(self.terminal, command.encode() + b"\r")
        prompt_position = self.wait_for(PROMPT, timeout, start=start)
        end = prompt_position + len(PROMPT)
        quiet_deadline = time.monotonic() + 0.25
        hard_deadline = time.monotonic() + 1
        while time.monotonic() < min(quiet_deadline, hard_deadline):
            readable, _, _ = select.select([self.terminal], [], [], 0.05)
            if not readable:
                continue
            try:
                self.output.extend(os.read(self.terminal, 4096))
            except OSError:
                break
            quiet_deadline = time.monotonic() + 0.25
            later_prompt = self.output.rfind(PROMPT, start)
            if later_prompt >= 0:
                end = later_prompt + len(PROMPT)
        return strip_terminal_control(self.output[start:end].decode(errors="replace"))

    def autocomplete(self, partial: str, expected: str, timeout: float = 10) -> None:
        start = len(self.output)
        os.write(self.terminal, partial.encode() + b"\t")
        self.wait_for(expected, timeout, start=start)
        os.write(self.terminal, b"\x03")
        self.wait_for(PROMPT, timeout, start=len(self.output))

    def close(self) -> None:
        try:
            os.write(self.terminal, b"\x04")
        except OSError:
            pass

        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                waited, _ = os.waitpid(self.process_id, os.WNOHANG)
            except ChildProcessError:
                waited = self.process_id
            if waited == self.process_id:
                break
            time.sleep(0.1)
        else:
            try:
                os.kill(self.process_id, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(self.process_id, 0)
            except ChildProcessError:
                pass
        os.close(self.terminal)


@dataclass
class JourneyWorld:
    """Own every mutable resource used by one Gherkin scenario."""

    temporary_project: tempfile.TemporaryDirectory
    project: Path
    output: Path
    environment: dict[str, str]
    port: int | None = None
    base_url: str | None = None
    process: subprocess.Popen | None = None
    log_file: object | None = None
    log_path: Path | None = None
    terminal: ReplTerminal | None = None
    command_results: dict[str, subprocess.CompletedProcess] = field(default_factory=dict)
    responses: dict[str, requests.Response] = field(default_factory=dict)

    @classmethod
    def create(cls, prefix: str = "counterfact-journey-") -> JourneyWorld:
        temporary_project = tempfile.TemporaryDirectory(prefix=prefix)
        project = Path(temporary_project.name)
        return cls(
            temporary_project=temporary_project,
            project=project,
            output=project / "out",
            environment={
                **os.environ,
                "CHOKIDAR_USEPOLLING": "1",
                "COUNTERFACT_TELEMETRY_DISABLED": "true",
                "TERM": "xterm-256color",
            },
        )

    def allocate_port(self) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.base_url = f"http://127.0.0.1:{self.port}"
        return self.port

    def write_json(self, relative_path: str | Path, value: object) -> Path:
        path = self.project / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        return path

    def write_text(self, relative_path: str | Path, value: str) -> Path:
        path = self.project / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")
        return path

    def run_cli(self, *arguments: object, name: str = "cli", timeout: float = 30) -> subprocess.CompletedProcess:
        result = subprocess.run(
            ["node", str(COUNTERFACT_BIN), *map(str, arguments)],
            cwd=self.project,
            env=self.environment,
            timeout=timeout,
            check=False,
            capture_output=True,
            text=True,
        )
        self.command_results[name] = result
        return result

    def start_cli(self, *arguments: object, terminal: bool = False) -> None:
        command = ["node", str(COUNTERFACT_BIN), *map(str, arguments)]
        if terminal:
            import pty

            process_id, terminal_fd = pty.fork()
            if process_id == 0:
                os.chdir(self.project)
                os.execvpe(command[0], command, self.environment)
            self.terminal = ReplTerminal(process_id, terminal_fd)
            return

        self.log_path = self.project / "server.log"
        self.log_file = self.log_path.open("w", encoding="utf-8")
        self.process = subprocess.Popen(
            command,
            cwd=self.project,
            env=self.environment,
            stdout=self.log_file,
            stderr=self.log_file,
        )

    def logs(self) -> str:
        if self.terminal is not None:
            return self.terminal.transcript()
        if self.log_file is not None:
            self.log_file.flush()
        if self.log_path is not None and self.log_path.exists():
            return self.log_path.read_text(encoding="utf-8")
        return "(no process log available)"

    def transcript(self) -> str:
        """Return the PTY transcript when this journey uses the real REPL."""
        return self.terminal.transcript() if self.terminal is not None else ""

    def wait_for_http(
        self,
        path: str,
        predicate: Callable[[requests.Response], bool],
        *,
        method: str = "get",
        timeout: float = RELOAD_TIMEOUT,
        **request_options: object,
    ) -> requests.Response:
        assert self.base_url is not None
        deadline = time.monotonic() + timeout
        last_response = None
        last_error = None
        while time.monotonic() < deadline:
            try:
                last_response = requests.request(
                    method,
                    f"{self.base_url}{path}",
                    timeout=2,
                    **request_options,
                )
                if predicate(last_response):
                    return last_response
            except requests.RequestException as error:
                last_error = error
            if self.process is not None and self.process.poll() is not None:
                break
            time.sleep(0.25)
        details = (
            f"last response was {last_response.status_code}: {last_response.text}"
            if last_response is not None
            else f"last request error was {last_error!r}"
        )
        raise AssertionError(
            f"Timed out waiting for {method.upper()} {path}; {details}.\n"
            f"Process diagnostics:\n{self.logs()}"
        )

    def request(self, method: str, path: str, *, name: str | None = None, **options: object) -> requests.Response:
        assert self.base_url is not None
        response = requests.request(
            method,
            f"{self.base_url}{path}",
            timeout=REQUEST_TIMEOUT,
            **options,
        )
        self.responses[name or path] = response
        return response

    def cleanup(self) -> None:
        if self.terminal is not None:
            self.terminal.close()
            self.terminal = None
        if self.process is not None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
            self.process = None
        if self.log_file is not None:
            self.log_file.close()
            self.log_file = None
        self.temporary_project.cleanup()
