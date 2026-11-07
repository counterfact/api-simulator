import { useEffect, useState } from "react";

import { loadProfile, type Profile } from "./api.js";

export function App() {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");

  useEffect(() => {
    void loadProfile(1)
      .then(setProfile)
      .catch(() => {
        setError("The profile is temporarily unavailable.");
      });
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!profile) return <p>Loading profile…</p>;

  return (
    <main>
      <p>Local API profile</p>
      <h1>{profile.name}</h1>
      <p>{profile.role}</p>
    </main>
  );
}
