// Session role, not transported AFI or VM placement, determines its view layer.
export function bgpSessionLayer(session) {
  return session.kind === "fabric" || session.kind === "host-tor" ? "underlay" : "overlay";
}

export function bgpSessionVisible(session, visibility) {
  return visibility.enabled && visibility[bgpSessionLayer(session)];
}

export function filterRouteFlowLayers(streams, sessions, visibility) {
  const visible = new Set(sessions.filter(session => bgpSessionVisible(session, visibility)).map(session => session.id));
  // Omit a whole example if a layer is hidden: never truncate a wave at an RS.
  return streams.filter(stream => stream.steps.every(step => visible.has(step.sessionID)));
}
