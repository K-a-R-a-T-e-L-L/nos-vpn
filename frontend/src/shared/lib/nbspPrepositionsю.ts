export function nbspPrepositions(text: string) {
  return text.replace(
    /(^|[\s(«"—-])((?:а|в|во|и|к|ко|о|об|от|по|под|с|со|у|из|за|на|не|но|для|при|без|над|перед|через))\s+/gimu,
    (_m, p1, p2) => `${p1}${p2}\u00A0`,
  );
}
