import { createRoot } from "react-dom/client";
import { PRODUCT } from "@lantern/shared";
createRoot(document.getElementById("root")!).render(<h1>{PRODUCT.name} simulator placeholder</h1>);
