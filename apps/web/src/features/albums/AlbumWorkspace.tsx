"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react";
import Image from "next/image";

import { useAuth } from "@/shared/auth/AuthProvider";
import type { Database } from "@/shared/auth/database.types";
import { getSupabaseBrowserClient } from "@/shared/auth/supabase";

const STORAGE_BUCKET = "travel-photos";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function hasExpectedImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];
type AlbumPhotoRow = Database["public"]["Tables"]["album_photos"]["Row"];
type Photo = PhotoRow & { signedUrl: string | null };
type Album = AlbumRow & { photos: Photo[] };
type UploadItem = {
  name: string;
  status: "검사 중" | "업로드 중" | "정보 저장 중" | "완료" | "실패";
  error?: string;
};
type PendingPhotoRegistration = Database["public"]["Tables"]["photos"]["Insert"];

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

export default function AlbumWorkspace({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cleanupPaths, setCleanupPaths] = useState<string[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<
    PendingPhotoRegistration[]
  >([]);
  const [retryingPath, setRetryingPath] = useState<string | null>(null);
  const [albumToEdit, setAlbumToEdit] = useState<Album | null>(null);
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [savingAlbum, setSavingAlbum] = useState(false);
  const [deletingAlbumId, setDeletingAlbumId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [showAlbumForm, setShowAlbumForm] = useState(false);

  const reportLoadFailure = useCallback((error: unknown) => {
    setWorkspaceError(`여행 자료를 불러오지 못했습니다: ${messageFrom(error)}`);
    setLoading(false);
    setPhotos([]);
    setAlbums([]);
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setWorkspaceError(null);
    const supabase = getSupabaseBrowserClient();

    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      setWorkspaceError(
        `그룹 구성원 확인에 실패했습니다. 그룹 기능 연동을 확인하세요: ${membershipError.message}`,
      );
      setLoading(false);
      setPhotos([]);
      setAlbums([]);
      return;
    }

    if (!membership) {
      setWorkspaceError("이 그룹의 구성원만 사진과 앨범을 볼 수 있습니다.");
      setLoading(false);
      setPhotos([]);
      setAlbums([]);
      return;
    }

    const [photoResult, albumResult] = await Promise.all([
      supabase
        .from("photos")
        .select(
          "id,group_id,uploaded_by,storage_path,original_name,content_type,byte_size,created_at",
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: false }),
      supabase
        .from("albums")
        .select("id,group_id,created_by,title,description,created_at,updated_at")
        .eq("group_id", groupId)
        .order("updated_at", { ascending: false }),
    ]);

    const queryError = photoResult.error ?? albumResult.error;
    if (queryError) {
      setWorkspaceError(`여행 자료를 불러오지 못했습니다: ${queryError.message}`);
      setLoading(false);
      setPhotos([]);
      setAlbums([]);
      return;
    }

    const photoRows = photoResult.data ?? [];
    const albumRows = albumResult.data ?? [];
    let albumPhotoRows: AlbumPhotoRow[] = [];

    if (albumRows.length > 0) {
      const { data, error } = await supabase
        .from("album_photos")
        .select("album_id,photo_id,position")
        .in("album_id", albumRows.map((album) => album.id))
        .order("position");
      if (error) {
        setWorkspaceError(`앨범 사진을 불러오지 못했습니다: ${error.message}`);
        setLoading(false);
        setPhotos([]);
        setAlbums([]);
        return;
      }
      albumPhotoRows = data ?? [];
    }

    const signedUrlByPath = new Map<string, string>();
    if (photoRows.length > 0) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(
          photoRows.map((photo) => photo.storage_path),
          60 * 60,
        );
      if (error) {
        setWorkspaceError(`사진 주소를 만들지 못했습니다: ${error.message}`);
        setLoading(false);
        setPhotos([]);
        setAlbums([]);
        return;
      }
      for (const result of data ?? []) {
        if (result.path && result.signedUrl) {
          signedUrlByPath.set(result.path, result.signedUrl);
        }
      }
    }

    const photoList: Photo[] = photoRows.map((photo) => ({
      ...photo,
      signedUrl: signedUrlByPath.get(photo.storage_path) ?? null,
    }));
    const photoMap = new Map(photoList.map((photo) => [photo.id, photo]));
    const rowsByAlbum = new Map<string, AlbumPhotoRow[]>();
    for (const row of albumPhotoRows) {
      const rows = rowsByAlbum.get(row.album_id) ?? [];
      rows.push(row);
      rowsByAlbum.set(row.album_id, rows);
    }

    setPhotos(photoList);
    setAlbums(
      albumRows.map((album) => ({
        ...album,
        photos: (rowsByAlbum.get(album.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .flatMap((row) => {
            const photo = photoMap.get(row.photo_id);
            return photo ? [photo] : [];
          }),
      })),
    );
    setLoading(false);
  }, [groupId, user]);

  useEffect(() => {
    void Promise.resolve().then(loadWorkspace).catch(reportLoadFailure);
  }, [loadWorkspace, reportLoadFailure]);

  useEffect(() => {
    if (!user) return;
    const channel = getSupabaseBrowserClient()
      .channel(`group-albums-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "photos",
          filter: `group_id=eq.${groupId}`,
        },
        () => void loadWorkspace().catch(reportLoadFailure),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "albums",
          filter: `group_id=eq.${groupId}`,
        },
        () => void loadWorkspace().catch(reportLoadFailure),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeError(
            "실시간 연결을 만들지 못했습니다. 새로고침으로 최신 내용을 확인하세요.",
          );
        } else if (status === "SUBSCRIBED") {
          setRealtimeError(null);
        }
      });

    return () => {
      void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [groupId, loadWorkspace, reportLoadFailure, user]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!user || files.length === 0 || uploading) return;

    setNotice(null);
    setUploading(true);
    setUploadItems(files.map((file) => ({ name: file.name, status: "검사 중" })));
    let completed = 0;
    const failures: string[] = [];
    const supabase = getSupabaseBrowserClient();

    for (const [index, file] of files.entries()) {
      const updateItem = (update: Partial<UploadItem>) => {
        setUploadItems((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...update } : item,
          ),
        );
      };

      if (!MIME_TYPES.has(file.type)) {
        const reason = "JPG, PNG, WebP 형식만 업로드할 수 있습니다.";
        updateItem({ status: "실패", error: reason });
        failures.push(`${file.name}: ${reason}`);
        continue;
      }
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        const reason = "사진은 10MB 이하여야 합니다.";
        updateItem({ status: "실패", error: reason });
        failures.push(`${file.name}: ${reason}`);
        continue;
      }
      try {
        if (!(await hasExpectedImageSignature(file))) {
          const reason = "파일 내용이 선택한 이미지 형식과 일치하지 않습니다.";
          updateItem({ status: "실패", error: reason });
          failures.push(`${file.name}: ${reason}`);
          continue;
        }
      } catch (error) {
        const reason = `파일 형식을 확인하지 못했습니다: ${messageFrom(error)}`;
        updateItem({ status: "실패", error: reason });
        failures.push(`${file.name}: ${reason}`);
        continue;
      }

      const path = `${groupId}/${user.id}/${crypto.randomUUID()}.${FILE_EXTENSIONS[file.type]}`;
      let uploadAttempted = false;
      let uploadComplete = false;
      let metadataAttempted = false;
      let registrationSettled = false;
      updateItem({ status: "업로드 중" });
      try {
        uploadAttempted = true;
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw uploadError;

        uploadComplete = true;
        updateItem({ status: "정보 저장 중" });
        metadataAttempted = true;
        const { error: insertError } = await supabase.from("photos").insert({
          group_id: groupId,
          uploaded_by: user.id,
          storage_path: path,
          original_name: file.name,
          content_type: file.type,
          byte_size: file.size,
        });

        if (insertError) {
          const { data: existingPhoto, error: lookupError } = await supabase
            .from("photos")
            .select("id,uploaded_by,group_id")
            .eq("storage_path", path)
            .maybeSingle();

          if (
            !lookupError &&
            existingPhoto?.uploaded_by === user.id &&
            existingPhoto.group_id === groupId
          ) {
            registrationSettled = true;
            completed += 1;
            updateItem({ status: "완료" });
            continue;
          }

          if (lookupError) {
            const pendingRegistration: PendingPhotoRegistration = {
              group_id: groupId,
              uploaded_by: user.id,
              storage_path: path,
              original_name: file.name,
              content_type: file.type,
              byte_size: file.size,
            };
            setPendingRegistrations((current) => [
              ...current,
              pendingRegistration,
            ]);
            registrationSettled = true;
            throw new Error(
              `DB 등록 여부를 확인하지 못했습니다 (${lookupError.message}). 파일은 보존했으며 아래에서 등록을 재시도할 수 있습니다.`,
            );
          }

          registrationSettled = true;
          let cleanupError: Error | null;
          try {
            const cleanupResult = await supabase.storage
              .from(STORAGE_BUCKET)
              .remove([path]);
            cleanupError = cleanupResult.error;
          } catch (cleanupFailure) {
            cleanupError =
              cleanupFailure instanceof Error
                ? cleanupFailure
                : new Error(messageFrom(cleanupFailure));
          }
          if (cleanupError) {
            setCleanupPaths((current) => [...current, path]);
            throw new Error(
              `DB 등록 실패 (${insertError.message}). 파일 정리도 실패했습니다 (${cleanupError.message}). 재정리 목록에 보관했습니다.`,
            );
          }
          throw new Error(
            `DB 등록 실패 (${insertError.message}); 업로드 파일은 정리했습니다.`,
          );
        }

        completed += 1;
        registrationSettled = true;
        updateItem({ status: "완료" });
      } catch (error) {
        let reason = messageFrom(error);
        if (uploadAttempted && !metadataAttempted) {
          try {
            const { error: cleanupError } = await supabase.storage
              .from(STORAGE_BUCKET)
              .remove([path]);
            if (cleanupError) {
              setCleanupPaths((current) => [...current, path]);
              reason = `${reason} 업로드 파일도 정리하지 못했습니다 (${cleanupError.message}). 정리 목록에서 재시도하세요.`;
            } else {
              reason = `${reason} 남은 업로드 파일은 정리했습니다.`;
            }
          } catch (cleanupFailure) {
            setCleanupPaths((current) => [...current, path]);
            reason = `${reason} 업로드 파일 정리 중 오류가 발생했습니다 (${messageFrom(cleanupFailure)}). 정리 목록에서 재시도하세요.`;
          }
        } else if (
          uploadComplete &&
          metadataAttempted &&
          !registrationSettled
        ) {
          setPendingRegistrations((current) => [
            ...current,
            {
              group_id: groupId,
              uploaded_by: user.id,
              storage_path: path,
              original_name: file.name,
              content_type: file.type,
              byte_size: file.size,
            },
          ]);
          reason = `${reason} 등록 결과가 불확실해 파일을 보존했습니다. 아래에서 DB 등록을 재시도하세요.`;
        }
        updateItem({ status: "실패", error: reason });
        failures.push(`${file.name}: ${reason}`);
      }
    }

    setNotice(
      `${files.length}개 중 ${completed}개 업로드 완료${
        failures.length ? `, ${failures.length}개 실패` : ""
      }.`,
    );
    setUploading(false);
    await loadWorkspace().catch(reportLoadFailure);
  }

  async function retryPhotoRegistration(
    pending: PendingPhotoRegistration,
  ) {
    if (retryingPath) return;
    setRetryingPath(pending.storage_path);
    setNotice(null);
    const supabase = getSupabaseBrowserClient();

    try {
      const { data: existingPhoto, error: lookupError } = await supabase
        .from("photos")
        .select("id,uploaded_by,group_id")
        .eq("storage_path", pending.storage_path)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (
        existingPhoto &&
        (existingPhoto.uploaded_by !== pending.uploaded_by ||
          existingPhoto.group_id !== pending.group_id)
      ) {
        throw new Error("저장 경로가 다른 사진 정보와 연결되어 있습니다.");
      }

      if (!existingPhoto) {
        const { error: insertError } = await supabase
          .from("photos")
          .insert(pending);
        if (insertError) {
          const { data: insertedPhoto, error: retryLookupError } = await supabase
            .from("photos")
            .select("id,uploaded_by,group_id")
            .eq("storage_path", pending.storage_path)
            .maybeSingle();

          if (retryLookupError) {
            throw new Error(
              `재등록 결과를 확인하지 못했습니다 (${retryLookupError.message}). 파일은 보존했습니다.`,
            );
          }
          if (
            !insertedPhoto ||
            insertedPhoto.uploaded_by !== pending.uploaded_by ||
            insertedPhoto.group_id !== pending.group_id
          ) {
            const { error: cleanupError } = await supabase.storage
              .from(STORAGE_BUCKET)
              .remove([pending.storage_path]);
            setPendingRegistrations((current) =>
              current.filter((item) => item.storage_path !== pending.storage_path),
            );
            if (cleanupError) {
              setCleanupPaths((current) => [...current, pending.storage_path]);
              throw new Error(
                `DB 등록 실패 (${insertError.message}) 및 파일 정리 실패 (${cleanupError.message}). 파일 정리를 재시도할 수 있습니다.`,
              );
            }
            throw insertError;
          }
        }
      }

      setPendingRegistrations((current) =>
        current.filter((item) => item.storage_path !== pending.storage_path),
      );
      setNotice("사진 정보를 등록했습니다.");
      await loadWorkspace().catch(reportLoadFailure);
    } catch (error) {
      setNotice(`사진 정보를 재등록하지 못했습니다: ${messageFrom(error)}`);
    } finally {
      setRetryingPath(null);
    }
  }

  async function retryCleanup(path: string) {
    try {
      const { error } = await getSupabaseBrowserClient()
        .storage.from(STORAGE_BUCKET)
        .remove([path]);
      if (error) {
        setNotice(`파일 정리 재시도 실패 (${path}): ${error.message}`);
        return;
      }
      setCleanupPaths((current) => current.filter((item) => item !== path));
      setNotice("남은 업로드 파일을 정리했습니다.");
    } catch (error) {
      setNotice(`파일 정리 재시도 실패 (${path}): ${messageFrom(error)}`);
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!user || deletingPhotoId) return;
    if (!window.confirm(`"${photo.original_name}" 사진을 삭제할까요?`)) return;
    setDeletingPhotoId(photo.id);
    setNotice(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: albumLink, error: albumLinkError } = await supabase
        .from("album_photos")
        .select("album_id")
        .eq("photo_id", photo.id)
        .limit(1)
        .maybeSingle();
      if (albumLinkError) {
        setNotice(
          `사진이 앨범에 포함됐는지 확인하지 못했습니다: ${albumLinkError.message}`,
        );
        return;
      }
      if (albumLink) {
        setNotice("이 사진이 포함된 앨범에서 먼저 사진을 제거한 뒤 삭제하세요.");
        return;
      }

      const { data, error } = await supabase
        .from("photos")
        .delete()
        .eq("id", photo.id)
        .eq("uploaded_by", user.id)
        .select("id")
        .maybeSingle();

      if (error || !data) {
        setNotice(
          error
            ? `사진 메타데이터를 삭제하지 못했습니다: ${error.message}`
            : "본인이 업로드했고 앨범에 포함되지 않은 사진만 삭제할 수 있습니다.",
        );
        return;
      }

      let storageError: string | null = null;
      try {
        const result = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([photo.storage_path]);
        storageError = result.error?.message ?? null;
      } catch (error) {
        storageError = messageFrom(error);
      }
      if (storageError) {
        setCleanupPaths((current) => [...current, photo.storage_path]);
        setNotice(
          `사진 정보는 삭제했지만 파일 정리에 실패했습니다. 아래 목록에서 재시도하세요: ${storageError}`,
        );
      } else {
        setNotice("사진을 삭제했습니다.");
      }
      await loadWorkspace().catch(reportLoadFailure);
    } catch (error) {
      setNotice(`사진을 삭제하지 못했습니다: ${messageFrom(error)}`);
    } finally {
      setDeletingPhotoId(null);
    }
  }

  function startCreateAlbum() {
    setAlbumToEdit(null);
    setAlbumTitle("");
    setAlbumDescription("");
    setSelectedPhotoIds([]);
    setShowAlbumForm(true);
  }

  function startEditAlbum(album: Album) {
    setAlbumToEdit(album);
    setAlbumTitle(album.title);
    setAlbumDescription(album.description);
    setSelectedPhotoIds(album.photos.map((photo) => photo.id));
    setShowAlbumForm(true);
  }

  function togglePhotoSelection(photoId: string) {
    setSelectedPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId],
    );
  }

  function movePhoto(photoId: string, offset: -1 | 1) {
    setSelectedPhotoIds((current) => {
      const index = current.indexOf(photoId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function makePhotoCover(photoId: string) {
    setSelectedPhotoIds((current) => [
      photoId,
      ...current.filter((id) => id !== photoId),
    ]);
  }

  async function saveAlbum() {
    if (!user || savingAlbum) return;
    setSavingAlbum(true);
    setNotice(null);
    const supabase = getSupabaseBrowserClient();
    const description = albumDescription.trim();
    try {
      const result = albumToEdit
        ? await supabase.rpc("update_album", {
            p_album_id: albumToEdit.id,
            p_expected_updated_at: albumToEdit.updated_at,
            p_title: albumTitle,
            p_description: description,
            p_photo_ids: selectedPhotoIds,
          })
        : await supabase.rpc("create_album", {
            p_group_id: groupId,
            p_title: albumTitle,
            p_description: description,
            p_photo_ids: selectedPhotoIds,
          });

      if (result.error) {
        setNotice(
          result.error.code === "40001"
            ? "다른 구성원이 앨범을 먼저 수정했습니다. 최신 데이터를 불러온 뒤 다시 편집해 주세요."
            : `앨범을 저장하지 못했습니다: ${result.error.message}`,
        );
        if (result.error.code === "40001") {
          await loadWorkspace().catch(reportLoadFailure);
        }
        return;
      }

      setShowAlbumForm(false);
      setAlbumToEdit(null);
      setNotice(albumToEdit ? "앨범을 수정했습니다." : "앨범을 만들었습니다.");
      await loadWorkspace().catch(reportLoadFailure);
    } catch (error) {
      setNotice(`앨범을 저장하지 못했습니다: ${messageFrom(error)}`);
    } finally {
      setSavingAlbum(false);
    }
  }

  async function deleteAlbum(album: Album) {
    if (!user || deletingAlbumId) return;
    if (!window.confirm(`"${album.title}" 앨범을 삭제할까요?`)) return;
    setDeletingAlbumId(album.id);
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("albums")
        .delete()
        .eq("id", album.id)
        .eq("created_by", user.id)
        .select("id")
        .maybeSingle();

      if (error || !data) {
        setNotice(
          error
            ? `앨범을 삭제하지 못했습니다: ${error.message}`
            : "앨범 작성자만 앨범을 삭제할 수 있습니다.",
        );
      } else {
        setNotice("앨범을 삭제했습니다.");
        await loadWorkspace().catch(reportLoadFailure);
      }
    } catch (error) {
      setNotice(`앨범을 삭제하지 못했습니다: ${messageFrom(error)}`);
    } finally {
      setDeletingAlbumId(null);
    }
  }

  return (
    <main className="content-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">공유 공간</p>
          <h1>여행 사진과 앨범</h1>
          <p>같은 그룹의 구성원에게 사진과 앨범이 공유됩니다.</p>
          <p className="group-id">그룹 ID: <code>{groupId}</code></p>
        </div>
        <div className="button-row">
          <label className={`button upload-button${uploading ? " disabled" : ""}`}>
            {uploading ? "업로드 중..." : "사진 여러 장 올리기"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={uploading}
              onChange={(event) => void handleUpload(event)}
            />
          </label>
          <button className="button" onClick={startCreateAlbum}>
            앨범 만들기
          </button>
        </div>
      </div>

      {workspaceError && <p className="error-message" role="alert">{workspaceError}</p>}
      {realtimeError && <p className="error-message" role="alert">{realtimeError}</p>}
      {notice && <p className="notice-message" role="status">{notice}</p>}
      {cleanupPaths.length > 0 && (
        <section className="cleanup-panel">
          <h2>정리가 필요한 파일</h2>
          {cleanupPaths.map((path) => (
            <div className="cleanup-row" key={path}>
              <code>{path}</code>
              <button
                className="button button-secondary"
                onClick={() => void retryCleanup(path)}
              >
                다시 정리
              </button>
            </div>
          ))}
        </section>
      )}
      {pendingRegistrations.length > 0 && (
        <section className="cleanup-panel">
          <h2>DB 등록 확인이 필요한 사진</h2>
          <p>저장 파일을 보존했습니다. 사진 정보를 안전하게 재확인하세요.</p>
          {pendingRegistrations.map((pending) => (
            <div className="cleanup-row" key={pending.storage_path}>
              <code>{pending.original_name}</code>
              <button
                className="button button-secondary"
                onClick={() => void retryPhotoRegistration(pending)}
                disabled={retryingPath !== null}
              >
                {retryingPath === pending.storage_path ? "확인 중..." : "DB 등록 재시도"}
              </button>
            </div>
          ))}
        </section>
      )}
      {uploadItems.length > 0 && (
        <section className="upload-progress" aria-live="polite">
          <h2>업로드 진행 상태</h2>
          <p>
            {uploadItems.filter((item) => item.status === "완료").length}/
            {uploadItems.length}개 완료
          </p>
          <ul>
            {uploadItems.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span>{item.name}</span> — {item.status}
                {item.error && <span className="inline-error"> ({item.error})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showAlbumForm && (
        <section className="editor-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{albumToEdit ? "앨범 편집" : "새 앨범"}</p>
              <h2>{albumToEdit ? "앨범 구성 수정" : "앨범 만들기"}</h2>
            </div>
            <button
              className="button button-secondary"
              onClick={() => setShowAlbumForm(false)}
              disabled={savingAlbum}
            >
              닫기
            </button>
          </div>
          <div className="stack-form">
            <label>
              제목
              <input
                maxLength={120}
                required
                value={albumTitle}
                onChange={(event) => setAlbumTitle(event.target.value)}
              />
            </label>
            <label>
              설명
              <textarea
                maxLength={2000}
                rows={3}
                value={albumDescription}
                onChange={(event) => setAlbumDescription(event.target.value)}
              />
            </label>
          </div>
          <h3>사진 선택 및 순서</h3>
          <p className="field-hint">
            첫 번째 사진이 앨범 표지입니다. 화살표로 순서를 바꾸세요.
          </p>
          {photos.length === 0 ? (
            <p>앨범에 넣을 사진을 먼저 업로드하세요.</p>
          ) : (
            <div className="photo-grid selection-grid">
              {photos.map((photo) => {
                const selectedIndex = selectedPhotoIds.indexOf(photo.id);
                return (
                  <article
                    className={`photo-card${selectedIndex >= 0 ? " selected" : ""}`}
                    key={photo.id}
                  >
                    {photo.signedUrl ? (
                      <Image
                        src={photo.signedUrl}
                        alt={photo.original_name}
                        width={480}
                        height={360}
                        unoptimized
                      />
                    ) : (
                      <div className="image-placeholder">사진을 불러오지 못했습니다</div>
                    )}
                    <div className="photo-card-body">
                      <button
                        className="selection-toggle"
                        onClick={() => togglePhotoSelection(photo.id)}
                        aria-pressed={selectedIndex >= 0}
                      >
                        {selectedIndex >= 0
                          ? `${selectedIndex + 1}번째 · 선택 해제`
                          : "앨범에 선택"}
                      </button>
                      {selectedIndex >= 0 && (
                        <div className="button-row compact-row">
                          <button
                            className="button button-secondary"
                            onClick={() => makePhotoCover(photo.id)}
                            disabled={selectedIndex === 0}
                          >
                            표지로 지정
                          </button>
                          <button
                            className="button button-secondary"
                            onClick={() => movePhoto(photo.id, -1)}
                            disabled={selectedIndex === 0}
                            aria-label="사진을 앞으로 이동"
                          >
                            ↑
                          </button>
                          <button
                            className="button button-secondary"
                            onClick={() => movePhoto(photo.id, 1)}
                            disabled={selectedIndex === selectedPhotoIds.length - 1}
                            aria-label="사진을 뒤로 이동"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {selectedPhotoIds.length === 0 && (
            <p className="error-message" role="status">사진을 하나 이상 선택하세요.</p>
          )}
          <div className="button-row editor-actions">
            <button
              className="button"
              onClick={() => void saveAlbum()}
              disabled={
                savingAlbum ||
                albumTitle.trim().length === 0 ||
                selectedPhotoIds.length === 0
              }
            >
              {savingAlbum ? "저장 중..." : "앨범 저장"}
            </button>
            <button
              className="button button-secondary"
              onClick={() => setShowAlbumForm(false)}
              disabled={savingAlbum}
            >
              취소
            </button>
          </div>
        </section>
      )}

      <section className="workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">그룹 사진</p>
            <h2>사진 모음 <span className="count-badge">{photos.length}</span></h2>
          </div>
          <button
            className="button button-secondary"
            onClick={() => void loadWorkspace().catch(reportLoadFailure)}
            disabled={loading}
          >
            최신 내용 불러오기
          </button>
        </div>
        {loading ? (
          <p aria-live="polite">사진과 앨범을 불러오는 중...</p>
        ) : photos.length === 0 ? (
          <div className="empty-card"><p>아직 공유된 사진이 없습니다.</p></div>
        ) : (
          <div className="photo-grid">
            {photos.map((photo) => (
              <article className="photo-card" key={photo.id}>
                {photo.signedUrl ? (
                  <Image
                    src={photo.signedUrl}
                    alt={photo.original_name}
                    width={480}
                    height={360}
                    unoptimized
                  />
                ) : (
                  <div className="image-placeholder">사진을 불러오지 못했습니다</div>
                )}
                <div className="photo-card-body">
                  <p title={photo.original_name}>{photo.original_name}</p>
                  <small>
                    {photo.uploaded_by === user?.id
                      ? "내가 업로드"
                      : `업로더 ${photo.uploaded_by.slice(0, 8)}`}
                  </small>
                  {photo.uploaded_by === user?.id && (
                    albums.some((album) =>
                      album.photos.some((albumPhoto) => albumPhoto.id === photo.id),
                    ) ? (
                      <small>
                        앨범 작성자가 앨범에서 제외한 뒤 삭제할 수 있습니다.
                      </small>
                    ) : (
                      <button
                        className="text-button danger-text"
                        onClick={() => void deletePhoto(photo)}
                        disabled={deletingPhotoId !== null}
                      >
                        {deletingPhotoId === photo.id ? "삭제 중..." : "내 사진 삭제"}
                      </button>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">공동 기록</p>
            <h2>여행 앨범 <span className="count-badge">{albums.length}</span></h2>
          </div>
        </div>
        {albums.length === 0 ? (
          <div className="empty-card"><p>아직 만든 앨범이 없습니다.</p></div>
        ) : (
          <div className="album-list">
            {albums.map((album) => (
              <article className="album-card" key={album.id}>
                <div className="album-heading">
                  <div>
                    <h3>{album.title}</h3>
                    <p>{album.description || "설명 없음"}</p>
                    <small>
                      {album.created_by === user?.id
                        ? "내가 만든 앨범"
                        : `작성자 ${album.created_by.slice(0, 8)}`}
                      {" · "}
                      {new Date(album.updated_at).toLocaleString("ko-KR")}
                    </small>
                  </div>
                  {album.created_by === user?.id && (
                    <div className="button-row">
                      <button
                        className="button button-secondary"
                        onClick={() => startEditAlbum(album)}
                      >
                        편집
                      </button>
                      <button
                        className="button button-danger"
                        onClick={() => void deleteAlbum(album)}
                        disabled={deletingAlbumId !== null}
                      >
                        {deletingAlbumId === album.id ? "삭제 중..." : "삭제"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="album-photo-grid">
                  {album.photos.map((photo, index) => (
                    <figure key={photo.id}>
                      {photo.signedUrl ? (
                        <Image
                          src={photo.signedUrl}
                          alt={photo.original_name}
                          width={480}
                          height={360}
                          unoptimized
                        />
                      ) : (
                        <div className="image-placeholder">사진을 불러오지 못했습니다</div>
                      )}
                      {index === 0 && <figcaption>표지</figcaption>}
                    </figure>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
