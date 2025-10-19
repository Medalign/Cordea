import time
from typing import Dict

_counters: Dict[str, int] = {}
_timings: Dict[str, float] = {}

def incr(name: str, by: int = 1):
    _counters[name] = _counters.get(name, 0) + by

def time_block(name: str):
    class T:
        def __enter__(self):
            self.t0 = time.perf_counter()
        def __exit__(self, exc_type, exc, tb):
            dt = (time.perf_counter() - self.t0) * 1000.0
            _timings[name] = dt
    return T()

def snapshot():
    return {"counters": dict(_counters), "timings_ms": dict(_timings)}
