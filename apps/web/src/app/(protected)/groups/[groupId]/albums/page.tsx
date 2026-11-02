import AlbumWorkspace from "@/features/albums/AlbumWorkspace";

export default async function GroupAlbumsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <AlbumWorkspace key={groupId} groupId={groupId} />;
}
