const TOKEN = localStorage.getItem("token") || "clinician-token"; // demo
const HEADERS = {"Authorization": TOKEN, "Content-Type": "application/json"};

document.getElementById("score-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    age_band: fd.get("age_band"),
    sex: fd.get("sex"),
    qtc_method: "fridericia",
    intervals: {
      HR_bpm: parseFloat(fd.get("HR_bpm")) || null,
      PR_ms: parseFloat(fd.get("PR_ms")) || null,
      QRS_ms: parseFloat(fd.get("QRS_ms")) || null,
      QT_ms: parseFloat(fd.get("QT_ms")) || null,
      RR_ms: parseFloat(fd.get("RR_ms")) || null
    }
  };
  const res = await fetch("/guardrail/score", {method:"POST", headers: HEADERS, body: JSON.stringify(payload)});
  document.getElementById("score-out").textContent = JSON.stringify(await res.json(), null, 2);
});

async function uploadFile(endpoint){
  const fileInput = document.getElementById("trend-file");
  if (!fileInput.files[0]) return;
  const form = new FormData(); form.append("file", fileInput.files[0]);
  const res = await fetch(endpoint, {method:"POST", headers: {"Authorization": TOKEN}, body: form});
  const data = await res.json();
  document.getElementById("trend-out").textContent = JSON.stringify(data, null, 2);
}
document.getElementById("upload-csv").addEventListener("click", ()=>uploadFile("/imports/csv"));
document.getElementById("upload-json").addEventListener("click", ()=>uploadFile("/imports/json"));
