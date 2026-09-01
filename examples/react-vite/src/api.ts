export interface Profile {
  id: number;
  name: string;
  role: string;
}

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4310";

export async function loadProfile(profileId: number): Promise<Profile> {
  const response = await fetch(`${apiBaseUrl}/profiles/${profileId}`);

  if (!response.ok) {
    throw new Error(`Profile request failed: ${response.status}`);
  }

  return response.json() as Promise<Profile>;
}
