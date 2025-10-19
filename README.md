---

### 📈 TrendView
Plots **serial QTc values** against **age- and sex-specific percentile bands** (50th / 90th / 99th) to visualise trends and detect outliers over time.

---

### 🧠 Architecture
| Layer | Description |
|-------|--------------|
| **Backend** | FastAPI app serving GuardRail logic and TrendView data |
| **Frontend** | Static HTML + JS for clinician input and visualisation |
| **Content** | Synthetic reference data and test cases (`age_bands.json`, `norms.json`, `percentiles.json`, `cases.json`) |

---

### ⚙️ Run locally
```bash
uvicorn backend.server:app --reload

### Run (demo)

export ECG_TOKEN_ADMIN=admin-token
export ECG_TOKEN_CLINICIAN=clinician-token
export ECG_TOKEN_OBSERVER=observer-token
export ECG_REF_VERSION=1.0.0
uvicorn backend.server:app --reload

### Tokens

Pass as HTTP header: `Authorization: clinician-token`
