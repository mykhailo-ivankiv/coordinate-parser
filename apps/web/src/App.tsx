import { createHashRouter, Navigate } from "react-router";
import { RouterProvider } from "react-router/dom";

// Pages live in the URL hash rather than the path: the app is served from GitHub Pages, which has no
// fallback to index.html, so "/coordinate-toolkit/convert" would 404 on reload while "#/convert" works.
//
// Each page is its own chunk, loaded when it is first opened: the map library is most of the
// converter's weight, the generated reference most of the API page's, and the parser needs neither.
const router = createHashRouter([
  {
    HydrateFallback: () => <p className="p-4 text-sm opacity-60">Завантаження…</p>,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import("./ParserPage.tsx")).ParserPage }),
      },
      {
        path: "convert",
        lazy: async () => ({ Component: (await import("./ConverterPage.tsx")).ConverterPage }),
      },
      {
        path: "guide",
        lazy: async () => ({ Component: (await import("./GuidePage.tsx")).GuidePage }),
      },
      {
        path: "api",
        lazy: async () => ({ Component: (await import("./ApiPage.tsx")).ApiPage }),
      },
      // Any other hash, as before: the parser.
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

const App = () => <RouterProvider router={router} />;

export default App;
