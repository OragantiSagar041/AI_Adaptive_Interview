export function downloadCsv(filename, rows) {
  const csvContent = "data:text/csv;charset=utf-8," + rows.map(row => row.join(",")).join("\n")
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportCandidatesReport(candidates) {
  if (window.XLSX) {
    const wsData = candidates.map(c => ({
      Name: c.candidate_name,
      Email: c.candidate_email,
      Position: c.interview_title,
      Status: c.status,
      Score: c.score,
      Created: c.created_at,
    }))
    const ws = window.XLSX.utils.json_to_sheet(wsData)
    const wb = window.XLSX.utils.book_new()
    window.XLSX.utils.book_append_sheet(wb, ws, "Candidates")
    window.XLSX.writeFile(wb, "Interview_Candidates_Report.xlsx")
    return
  }

  downloadCsv("Interview_Candidates_Report.csv", [
    ["Name", "Email", "Position", "Status", "Score", "Created"],
    ...candidates.map(c => [
      c.candidate_name,
      c.candidate_email,
      c.interview_title,
      c.status,
      c.score,
      c.created_at,
    ]),
  ])
}

export function downloadCandidateTemplate() {
  if (window.XLSX) {
    const ws = window.XLSX.utils.aoa_to_sheet([
      ["Name", "Email"],
      ["John Doe", "john@example.com"],
      ["Jane Smith", "jane@example.com"],
    ])
    const wb = window.XLSX.utils.book_new()
    window.XLSX.utils.book_append_sheet(wb, ws, "Candidates")
    window.XLSX.writeFile(wb, "interview_candidates_template.xlsx")
    return
  }

  downloadCsv("interview_candidates_template.csv", [
    ["Name", "Email"],
    ["John Doe", "john@example.com"],
    ["Jane Smith", "jane@example.com"],
  ])
}
