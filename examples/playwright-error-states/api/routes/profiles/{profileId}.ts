import type { getProfile } from "../../types/paths/profiles/{profileId}.types.js";

export const GET: getProfile = ($) => {
  if ($.path.profileId === 404) return $.response[404].empty();
  if ($.path.profileId === 503) {
    return $.response[503].text("Try again shortly");
  }

  return $.response[200].json({
    id: $.path.profileId,
    name: "Ada Lovelace",
  });
};
