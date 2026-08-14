import { useState } from "react";
import { coordinateParser } from "./parsers/coordinateParser.ts";

// Grouped by the `system` coordinateParser actually reports, not by which parser module
// produced the match — the European variants are a spelling of WGS84, not a system of
// their own. The WGS84R examples use Sydney because its longitude is past 90°: anything
// readable as latitude first is claimed by WGS84 before the reversed branch is tried.
const examples = [
  {
    system: "WGS84",
    order: "широта, потім довгота",
    inputs: [
      { input: "50.4501, 30.5234", note: "через кому" },
      { input: "50.4501 30.5234", note: "через пробіл" },
      { input: "50,4501 30,5234", note: "кома як десятковий знак, роздільник лише пробіл" },
    ],
  },
  {
    system: "WGS84R",
    order: "довгота, потім широта",
    inputs: [
      { input: "151.2093, -33.8688", note: "через кому" },
      { input: "151,2093 -33,8688", note: "кома як десятковий знак, роздільник лише пробіл" },
    ],
  },
];

const CoordinateInput = () => {
  const [text, setText] = useState("");
  const result = coordinateParser.run(text);

  return (
    <div>
      <input
        type="text"
        className="p-2 w-full border rounded-sm"
        placeholder="Enter coordinates"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="mt-3 text-sm">Ви можете вводити координати в наступних форматах:</p>
      {examples.map(({ system, order, inputs }) => (
        <section key={system} className="mt-2 text-sm">
          <h3>
            <span className="font-bold">{system}</span>
            <span className="opacity-60"> — {order}</span>
          </h3>
          <ul className="mt-1 flex flex-col gap-1">
            {inputs.map(({ input, note }) => (
              <li key={input}>
                <button
                  type="button"
                  className="cursor-pointer font-mono underline underline-offset-2 hover:no-underline"
                  onClick={() => setText(input)}
                >
                  {input}
                </button>
                <span className="opacity-60"> — {note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="whitespace-pre-wrap font-mono">{JSON.stringify(result, null, 2)}</div>
    </div>
  );
};

function App() {
  return (
    <main className="max-w-[60ch] p-4 m-auto">
      <h2>Парсер координат</h2>
      <CoordinateInput />
    </main>
  );
}

export default App;
