import pytest

from support.journey import JourneyWorld


@pytest.fixture
def journey():
    """Provide an isolated world and reliably tear down every scenario resource."""
    world = JourneyWorld.create()
    try:
        yield world
    finally:
        world.cleanup()
