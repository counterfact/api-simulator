type Scenario =
  | "happy"
  | "rate-limit"
  | "transient-503"
  | "permanent-429"
  | "bad-request";

export class Context {
  scenario: Scenario = "happy";
  requests: Array<{ cursor: string; status: number }> = [];
  audit = {
    resets: [] as Scenario[],
    requests: [] as Array<{
      scenario: Scenario;
      cursor: string;
      status: number;
    }>,
  };
  attempts = new Map<string, number>();

  reset(scenario: Scenario) {
    this.scenario = scenario;
    this.requests = [];
    this.attempts.clear();
    this.audit.resets.push(scenario);
  }

  nextAttempt(cursor: string) {
    const attempt = (this.attempts.get(cursor) ?? 0) + 1;
    this.attempts.set(cursor, attempt);
    return attempt;
  }

  record(cursor: string, status: number) {
    this.requests.push({ cursor, status });
    this.audit.requests.push({ scenario: this.scenario, cursor, status });
  }
}
