import type { getProfile } from "../../types/paths/profiles/{profileId}.types.js";

export const GET: getProfile = ($) =>
  $.path.profileId === 1
    ? $.response[200].json({
        id: 1,
        name: "Ada Lovelace",
        role: "Frontend engineer",
      })
    : $.response[404].empty();
