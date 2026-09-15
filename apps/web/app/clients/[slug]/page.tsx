import { Client360 } from "../../../components/Client360";

export default async function Client360Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Client360 slug={slug} />;
}
