import AdminHeader from "../../admin-header";
import TeamsNav from "../teams-nav";
import ScoreboardControls from "../../scoreboard-controls";

export default function ScoreboardSettingsPage() {
  return <main className="admin-studio">
    <AdminHeader active="teams" />
    <section className="admin-workspace">
      <TeamsNav active="scoreboard" />
      <h1>Scoreboard settings</h1>
      <p className="admin-page-description">Choose who can view scores and the default ranking shown to administrators.</p>
      <ScoreboardControls />
    </section>
  </main>;
}
