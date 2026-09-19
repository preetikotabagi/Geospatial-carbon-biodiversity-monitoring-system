function SummaryCards({ projectCount, siteCount, totalAreaHa, totalCarbon, avgBiodiversity }) {
  const cards = [
    { label: "Projects", value: projectCount, unit: "" },
    { label: "Sites", value: siteCount, unit: "" },
    { label: "Total Area", value: totalAreaHa.toFixed(2), unit: "ha", accent: "blue" },
    { label: "Total Carbon", value: totalCarbon.toFixed(0), unit: "tCO\u2082e" },
    {
      label: "Avg Biodiversity",
      value: avgBiodiversity.toFixed(1),
      unit: "/ 100",
      accent: "blue",
    },
  ];

  return (
    <div className="summary-grid">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`card summary-card${card.accent === "blue" ? " accent-blue" : ""}`}
        >
          <p className="label">{card.label}</p>
          <p className="value">
            {card.value}
            {card.unit && (
              <span style={{ fontSize: "1rem", fontWeight: 600 }}> {card.unit}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

export default SummaryCards;
