import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { AppRoutes } from "./routes"
import { applySurfaceTheme, surface } from "./surface"

applySurfaceTheme(surface)
document.title = surface.name
import "@fontsource-variable/newsreader/wght.css"
import "@fontsource-variable/geist/wght.css"
import "@fontsource-variable/geist-mono/wght.css"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter><AppRoutes /></BrowserRouter>
  </StrictMode>,
)
