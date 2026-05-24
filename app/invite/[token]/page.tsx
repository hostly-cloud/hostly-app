import InviteLandingClient from "./invite-landing-client";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InviteLandingPage({ params }: InvitePageProps) {
  const { token } = await params;
  return <InviteLandingClient token={token?.trim() ?? ""} />;
}
