/**
 * Twitch clip GQL resolve constants, externalized here (per #354) so they can be
 * bumped without touching resolver logic or shipping a code change to logic.
 *
 * Twitch owns the persisted-query registry and rotates it; the operation name has
 * itself migrated before (the observed `VideoAccessToken_Clip` →
 * `ShareClipRenderStatus` shift), and access tokens are short-lived. If clip
 * resolution starts returning null across the board, refresh `TWITCH_GQL_SHA256`
 * (and `TWITCH_GQL_OP`, if the op was renamed) from a current yt-dlp or streamlink
 * release — those track the live values. Nothing else needs to change.
 */

// Public web Client-ID, hard-coded in streamlink/yt-dlp. Not a secret: it merely
// identifies the anonymous web client to the GQL endpoint, and is an allowed
// custom request header. Bump only if Twitch retires it.
export const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

// Persisted GraphQL operation returning a clip's playback access token + its mp4
// renditions in one call.
export const TWITCH_GQL_OP = 'VideoAccessToken_Clip';

// sha256 of the persisted query Twitch registered for `TWITCH_GQL_OP`.
export const TWITCH_GQL_SHA256 =
  '36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11';

// VOD playback-access-token query (a *raw* GQL query, not a persisted hash — the
// public `PlaybackAccessToken` query yt-dlp/streamlink send anonymously with the
// web Client-ID). It mints the short-lived sig+token that authorizes the VOD's
// usher HLS master. Only the `isVod` branch is exercised here (isLive:false);
// the streamPlaybackAccessToken half is retained verbatim so the query matches
// the shape Twitch expects. Refresh from a current yt-dlp/streamlink release if
// Twitch changes the query.
export const TWITCH_VOD_GQL_QUERY =
  'query PlaybackAccessToken($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {' +
  ' streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature __typename }' +
  ' videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename }' +
  ' }';
