
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Login, SignUp } from "../screens/Auth";
import { Expenses, ManageExpenses, Parser, Statements } from "../screens/Expenses";
import { Entry } from "../screens/Entry";
import { Overview } from "../screens/Overview";
import "../styles/global.css";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/expenses/manage" element={<ManageExpenses />} />
        <Route path="/expenses/parser" element={<Parser />} />
        <Route path="/expenses/statements" element={<Statements />} />
        <Route path="/entry" element={<Entry />} />
        <Route path="/overview" element={<Overview />} />
      </Routes>
    </BrowserRouter>
  );
}
