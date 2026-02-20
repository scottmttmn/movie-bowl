import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BowlCard from "../components/BowlCard";
import NewBowlButton from "../components/NewBowlButton";

export default function MyBowlsScreen() {
  const [bowls, setBowls] = useState([
    { id: 1, name: "Friday Night Movies", remainingCount: 12, memberCount: 2, role: "Owner" },
    { id: 2, name: "Couples Favorites", remainingCount: 5, memberCount: 2, role: "Contributor" },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBowlName, setNewBowlName] = useState("");
  const navigate = useNavigate();

  const handleSelectBowl = (bowlId) => {
    navigate(`/bowl/${bowlId}`);
  };

  const handleNewBowl = () => {
    setIsModalOpen(true);
  };

  const handleCreateBowl = () => {
    if (newBowlName.trim() === "") return;
    const newBowl = {
      id: bowls.length ? bowls[bowls.length - 1].id + 1 : 1,
      name: newBowlName.trim(),
      remainingCount: 0,
      memberCount: 1,
      role: "Owner",
    };
    setBowls([...bowls, newBowl]);
    setNewBowlName("");
    setIsModalOpen(false);
  };

  const handleCloseModal = () => {
    setNewBowlName("");
    setIsModalOpen(false);
  };

  return (
    <div className="my-bowls-screen p-6 max-w-3xl mx-auto">
      <header className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">My Bowls</h2>
        <NewBowlButton onClick={handleNewBowl} />
      </header>
      <div className="bowl-list space-y-4">
        {bowls.map((b) => (
          <BowlCard key={b.id} bowl={b} onSelect={handleSelectBowl} />
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-80 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Create New Bowl</h3>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Bowl Name"
              value={newBowlName}
              onChange={(e) => setNewBowlName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBowl(); }}
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={handleCreateBowl}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}