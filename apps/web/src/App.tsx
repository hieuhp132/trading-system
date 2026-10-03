import { RouterProvider } from "react-router-dom";

import { AppProviders } from "./app/AppProviders";
import { router } from "./app/router";

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
