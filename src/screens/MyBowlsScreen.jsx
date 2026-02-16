import BowlCard from "../components/BowlCard";
import NewBowlButton from "../components/NewBowlButton";

const mockBowls = [
  { id: 1, name: "Friday Night Movies", remainingCount: 12, memberCount: 2, role: "Owner" },
  { id: 2, name: "Couples Favorites", remainingCount: 5, memberCount: 2, role: "Contributor" },
];

export default function MyBowlsScreen() {
  const handleSelectBowl = (bowlId) => {
    console.log("Open Bowl Dashboard:", bowlId);
  };
  const handleNewBowl = () => {
    console.log("Open create bowl modal");
    // Later: open modal or navigate to create screen
  }

  return (
    <div className="my-bowls-screen">
      <header>
        <h2>My Bowls</h2>
        <NewBowlButton onClick={handleNewBowl} />
      </header>
      <div className="bowl-list">
        {mockBowls.map((b) => (
          <BowlCard key={b.id} bowl={b} onSelect={handleSelectBowl} />
        ))}
      </div>
    </div>
  );
}