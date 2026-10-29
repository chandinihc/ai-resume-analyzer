import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#3977ed", "#59c5b2", "#a68af6", "#f0ac62", "#7d91aa"];

export default function SkillsChart({ data, total }) {
  return (
    <>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={83} paddingAngle={4} stroke="none">
              {data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="chart-center"><strong>{total}</strong><span>skills</span></div>
      </div>
      <div className="legend-list">
        {data.slice(0, 5).map((item, index) => (
          <div key={item.name}><span style={{ background: COLORS[index % COLORS.length] }} />{item.name}<b>{item.value}</b></div>
        ))}
      </div>
    </>
  );
}
