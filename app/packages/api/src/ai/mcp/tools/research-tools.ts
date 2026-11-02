// Tools over Discover, the image source check and the photo of a measurement (US-KI-04, US-KI-05, US-ENT-08).
import { ID, IDEMPOTENCY, keyOf, object, query, seg, str, TIME_ZONE, type McpTool } from "./schema";

export const RESEARCH_TOOLS: readonly McpTool[] = [
  {
    name: "get_discover_suggestions",
    title: "Discover suggestions",
    description:
      "The deck of species the app suggests for the keeper's free light zones (Discover). Do not rate them yourself.",
    operation: "discover_suggestions",
    inputSchema: object(
      {
        timeZone: TIME_ZONE,
        deck: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Deck number, default 1.",
        },
        zone: {
          type: "integer",
          minimum: 2,
          maximum: 4,
          description: "Only this light zone (2 to 4).",
        },
      },
      ["timeZone"],
    ),
    readOnly: true,
    request: (a) => ({
      method: "GET",
      path: query("/mcp/discover/suggestions", a, ["timeZone", "deck", "zone"]),
    }),
  },
  {
    name: "decide_discover_suggestion",
    title: "Yes, no or later on a suggestion",
    description:
      "The keeper's answer to a Discover suggestion. With the right 'write' it is saved at once, with 'drafts' it " +
      "becomes a draft the keeper confirms in the app.",
    operation: "discover_draft",
    inputSchema: object(
      {
        species: str("Species name as in the suggestion.", { minLength: 1, maxLength: 200 }),
        decision: { type: "string", enum: ["yes", "no", "later"] },
        timeZone: TIME_ZONE,
        idempotencyKey: IDEMPOTENCY,
      },
      ["species", "decision", "timeZone"],
    ),
    readOnly: false,
    request: ({ idempotencyKey, ...a }) => ({
      method: "POST",
      path: "/mcp/discover/decisions",
      body: a,
      ...keyOf({ idempotencyKey }),
    }),
  },
  {
    name: "check_image_source",
    title: "Check an image source",
    description:
      "Lets the server check a Wikimedia Commons file page for reachability and license. Only the answer of this " +
      "tool counts as checked.",
    operation: "check_image_source",
    inputSchema: object({ url: str("Commons file page URL.", { minLength: 1, maxLength: 2000 }) }, [
      "url",
    ]),
    readOnly: true,
    needsSources: true,
    request: (a) => ({ method: "GET", path: query("/mcp/image-source", a, ["url"]) }),
  },
  {
    name: "get_measurement_photo",
    title: "Photo of a measurement",
    description:
      "The cleaned photo of one of the keeper's measurements, to suggest a quality and a short note as a " +
      "photo_assessment draft. Judge only what is visible.",
    operation: "measurement_photo",
    inputSchema: object({ measurementId: ID("measurement") }, ["measurementId"]),
    readOnly: true,
    request: (a) => ({ method: "GET", path: `/mcp/measurements/${seg(a["measurementId"])}/photo` }),
  },
];
