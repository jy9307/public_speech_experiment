export default function SpeakingMaterials({ materials }) {
  const paragraphs = materials.text.trim().split(/\r?\n\s*\r?\n/);
  return <section className="speaking-materials" aria-label="발표 지문" data-materials-sha256={materials.sha256}>
    <span className="eyebrow">발표 지문</span>
    {paragraphs.map((paragraph, index) => {
      if (paragraph.startsWith("# ")) return <h2 key={index}>{paragraph.slice(2)}</h2>;
      if (paragraph.trim() === "---") return <hr key={index}/>;
      return <p key={index}>{paragraph.split(/(\*[^*\n]+\*)/g).map((part, n) => part.startsWith("*") && part.endsWith("*") ? <em key={n}>{part.slice(1,-1)}</em> : part)}</p>;
    })}
  </section>;
}
