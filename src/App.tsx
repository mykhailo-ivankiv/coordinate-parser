import {useState} from "react";

const CoordinateInput = () => {
    const [text, setText] = useState('');
    const result = {
        text,
        result: {
            latitude: 0,
            longitude: 0,
        },
        errors: null
    }
    return <div>
        <input
        type="text" className="p-2 w-full border rounded-sm"
        placeholder="Enter coordinates"
        value={text}
        onChange={(e) => setText(e.target.value)}
    />
        <div className="whitespace-pre-wrap font-mono">
            {JSON.stringify(result, null, 2)}
        </div>
    </div>;
}


function App() {
  return (
    <main className="max-w-[60ch] p-4 m-auto">
      <h2>Тестовий опис</h2>
      <CoordinateInput/>
    </main>
  )
}

export default App
