import os
from typing import Literal

Role = Literal["admin", "clinician", "observer"]

TOKENS = {
    os.environ.get("ECG_TOKEN_ADMIN", "admin-token"): "admin",
    os.environ.get("ECG_TOKEN_CLINICIAN", "clinician-token"): "clinician",
    os.environ.get("ECG_TOKEN_OBSERVER", "observer-token"): "observer",
}

def role_from_token(token: str) -> Role:
    return TOKENS.get(token, "observer")
