import { repairCommonJsxSyntaxErrors } from "../src/lib/gafcore-media.shared.ts";

const cases = [
  {
    name: "map bare object",
    in: `const features = [{ title: "A", icon: Sparkles }];
export default function App() {
  return <ul>{features.map((feature) => <li>{feature}</li>)}</ul>;
}`,
    mustNotInclude: ["{feature}"],
    mustInclude: ["feature.title", "feature.label"],
  },
  {
    name: "useState array",
    in: `const [stats, setStats] = useState([{ label: "10k", value: "Users" }]);
export default function App() {
  return <div>{stats.map((stat) => <p>{stat}</p>)}</div>;
}`,
    mustNotInclude: ["{stat}"],
  },
  {
    name: "icon field",
    in: `const items = [{ icon: Star, title: "X" }];
export default function App() {
  return <div>{items.map((it) => <span>{it.icon}</span>)}</div>;
}`,
    mustInclude: ["<it.icon"],
  },
  {
    name: "fake element type hash",
    in: `const x = { type: "#", props: { children: "Hola" } };
export default function App() { return <div>{x}</div>; }`,
    mustInclude: ["props?.children", "Hola"],
  },
];

for (const c of cases) {
  const out = repairCommonJsxSyntaxErrors(c.in);
  for (const bad of c.mustNotInclude ?? []) {
    if (out.includes(bad)) throw new Error(`${c.name}: still contains ${bad}`);
  }
  for (const good of c.mustInclude ?? []) {
    if (!out.includes(good)) throw new Error(`${c.name}: missing ${good}`);
  }
}

const arrayChild = repairCommonJsxSyntaxErrors(`const stats = [{ label: "10k" }];
export default function App() { return <div>{stats}</div>; }`);
if (arrayChild.includes("{stats}") && !arrayChild.includes("stats.map")) {
  throw new Error("array as child should use .map");
}

console.log("smoke-gafcore-jsx-repair: ok", cases.length + 1, "cases");
