import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MyBowlsScreen from "./screens/MyBowlsScreen";
import BowlDashboard from "./screens/BowlDashboard";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MyBowlsScreen />} />
        <Route path="/bowl/:bowlId" element={<BowlDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;