import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Image } from "expo-image";
import { Camera, ChevronLeft, ChevronRight, Image as ImageIcon, Share2, X } from "lucide-react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type PdfImage = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

const MAX_IMAGES = 12;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function pdfHtml(images: PdfImage[], title: string) {
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>@page { size: A4; margin: 18px; } body { margin: 0; font-family: Helvetica, Arial, sans-serif; } .page { page-break-after: always; break-after: page; display: flex; min-height: 1030px; align-items: center; justify-content: center; } .page:last-child { page-break-after: auto; break-after: auto; } img { max-width: 100%; max-height: 1010px; object-fit: contain; } </style></head>
<body aria-label="${escapeHtml(title)}">${images.map((image) => `<section class="page"><img alt="Página" src="data:${image.mimeType};base64,${image.data}" /></section>`).join("")}</body></html>`;
}

export function ImagePdfCreator({ visible, onClose }: Props) {
  const [images, setImages] = useState<PdfImage[]>([]);
  const [title, setTitle] = useState("documento");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setImages([]);
    setTitle("documento");
    setNotice(null);
    onClose();
  }

  async function addImages(source: "camera" | "library") {
    setNotice(null);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setNotice("O PDF pode ter até 12 fotos.");
      return;
    }
    try {
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, base64: true, allowsMultipleSelection: true, selectionLimit: remaining });
      if (result.canceled) return;
      const additions = result.assets.slice(0, remaining).map((asset, index) => {
        if (!asset.base64) throw new Error("Não foi possível preparar uma das fotos.");
        return {
          id: `${Date.now()}-${index}-${asset.assetId ?? "foto"}`,
          name: asset.fileName ?? `Página ${images.length + index + 1}`,
          mimeType: asset.mimeType ?? "image/jpeg",
          data: asset.base64,
        };
      });
      setImages((current) => [...current, ...additions]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível abrir as fotos.");
    }
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= images.length) return;
    setImages((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination]!, next[index]!];
      return next;
    });
  }

  async function createAndShare() {
    if (!images.length || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const html = pdfHtml(images, title.trim() || "documento");
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        setNotice("A janela de impressão foi aberta. Escolha “Salvar como PDF” para concluir.");
        return;
      }
      const file = await Print.printToFileAsync({ html, width: 595, height: 842 });
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("O compartilhamento de arquivos não está disponível neste aparelho.");
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: `Compartilhar ${title.trim() || "documento"}.pdf`,
      });
      setNotice("PDF pronto. O arquivo temporário fica protegido no app.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível criar o PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <ThemedView style={styles.screen}>
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>Fotos para PDF</ThemedText>
            <ThemedText themeColor="textSecondary" type="small">Tudo é montado no seu celular.</ThemedText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar criador de PDF" hitSlop={12} onPress={close}>
            <X size={24} color="#e6e9ef" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.actions}>
            <Pressable style={styles.addButton} onPress={() => void addImages("camera")} disabled={busy}>
              <Camera size={20} color="#dce5ff" /><ThemedText type="smallBold">Câmera</ThemedText>
            </Pressable>
            <Pressable style={styles.addButton} onPress={() => void addImages("library")} disabled={busy}>
              <ImageIcon size={20} color="#dce5ff" /><ThemedText type="smallBold">Adicionar fotos</ThemedText>
            </Pressable>
          </View>

          <ThemedText themeColor="textSecondary" type="small">{images.length}/{MAX_IMAGES} páginas · toque nas setas para ordenar</ThemedText>
          {images.length === 0 ? (
            <View style={styles.empty}><ImageIcon size={32} color="#8b94a5" /><ThemedText themeColor="textSecondary">Escolha fotos de documentos, anotações ou páginas.</ThemedText></View>
          ) : (
            <View style={styles.grid}>
              {images.map((image, index) => (
                <View key={image.id} style={styles.card}>
                  <Image source={{ uri: `data:${image.mimeType};base64,${image.data}` }} contentFit="cover" style={styles.preview} />
                  <View style={styles.cardFooter}>
                    <ThemedText type="smallBold">Página {index + 1}</ThemedText>
                    <View style={styles.orderActions}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Mover página ${index + 1} para trás`} disabled={index === 0} onPress={() => move(index, -1)}><ChevronLeft size={18} color="#e6e9ef" /></Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Mover página ${index + 1} para frente`} disabled={index === images.length - 1} onPress={() => move(index, 1)}><ChevronRight size={18} color="#e6e9ef" /></Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remover página ${index + 1}`} onPress={() => setImages((current) => current.filter((item) => item.id !== image.id))}><X size={17} color="#ffaba8" /></Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
          <View style={styles.nameBlock}>
            <ThemedText type="smallBold">Nome do arquivo</ThemedText>
            <TextInput value={title} onChangeText={setTitle} editable={!busy} maxLength={80} placeholder="documento" placeholderTextColor="#8b94a5" style={styles.input} />
            <ThemedText themeColor="textSecondary" type="small">O compartilhamento só abre depois que você tocar no botão abaixo.</ThemedText>
          </View>
          {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}
        </ScrollView>
        <Pressable accessibilityRole="button" disabled={!images.length || busy} onPress={() => void createAndShare()} style={[styles.shareButton, (!images.length || busy) && styles.disabled]}>
          {busy ? <ActivityIndicator color="#10131b" /> : <Share2 size={20} color="#10131b" />}
          <ThemedText style={styles.shareLabel}>{busy ? "Preparando PDF…" : "Criar e compartilhar PDF"}</ThemedText>
        </Pressable>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 18 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 8 }, title: { fontSize: 22, fontWeight: "700" }, content: { gap: 16, paddingBottom: 12 }, actions: { flexDirection: "row", gap: 10 }, addButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderRadius: 12, backgroundColor: "#272d3d" }, empty: { minHeight: 180, gap: 12, padding: 22, borderWidth: 1, borderColor: "#343a47", borderStyle: "dashed", borderRadius: 16, alignItems: "center", justifyContent: "center" }, grid: { gap: 12 }, card: { overflow: "hidden", borderRadius: 14, backgroundColor: "#202631" }, preview: { width: "100%", height: 180, backgroundColor: "#12161f" }, cardFooter: { minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, orderActions: { flexDirection: "row", alignItems: "center", gap: 14 }, nameBlock: { gap: 8, marginTop: 4 }, input: { minHeight: 46, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#343a47", color: "#e6e9ef", fontSize: 16 }, notice: { color: "#c8d2e8", lineHeight: 20 }, shareButton: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, backgroundColor: "#6f8cff" }, shareLabel: { color: "#10131b", fontWeight: "700" }, disabled: { opacity: 0.45 },
});
