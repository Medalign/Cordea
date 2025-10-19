from backend.logic import qtc_fridericia

def test_qtc_fridericia_rounding():
    assert qtc_fridericia(460, 900) == 476.0
