import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./options.css";
import "./learned-rules.css";
import "./reports.css";
import "./finance-reports.css";
import "./product-prices.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
