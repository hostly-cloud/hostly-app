export type ClipboardWriter = (text: string) => Promise<void>;

export async function copyInviteLink(
  inviteUrl: string,
  writeText: ClipboardWriter = (text) => navigator.clipboard.writeText(text),
): Promise<void> {
  const url = inviteUrl.trim();
  if (!url) throw new Error("INVITE_URL_REQUIRED");
  await writeText(url);
}
