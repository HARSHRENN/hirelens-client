export function TrackerPreview({ rows }: { rows: string[][] }) {
 return <div className="table-wrap" aria-label="Candidate tracker preview"><table className="table"><thead><tr>{rows[0]?.map((v,i)=><th key={i}>{v}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
}
