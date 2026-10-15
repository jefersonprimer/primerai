import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Copy, Share2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api, type MeetingAnalysis } from '@/lib/api';
import { useSession } from '@/state/session';

export default function MeetingScreen() {
  const { session } = useSession();
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState<MeetingAnalysis | null>(null);
  const [groupMessage, setGroupMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function organize() {
    if (!session?.accessToken || busy) return;
    setBusy(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await api.analyzeMeeting(session.accessToken, transcript, title.trim() || undefined);
      setAnalysis(result.analysis);
      setGroupMessage(result.analysis.groupMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível organizar a reunião.');
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    await Clipboard.setStringAsync(groupMessage);
  }

  async function shareMessage() {
    await Share.share({ message: groupMessage });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ThemedView style={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" style={styles.back} onPress={() => router.back()}>
            <ChevronLeft size={24} color="#e6e9ef" />
          </Pressable>
          <View style={styles.headerText}>
            <ThemedText type="smallBold">Reunião inteligente</ThemedText>
            <ThemedText themeColor="textSecondary" type="small">Transcrição em decisões e tarefas</ThemedText>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!analysis ? (
            <>
              <ThemedText type="title" style={styles.title}>Organize sua reunião</ThemedText>
              <ThemedText themeColor="textSecondary">Cole uma transcrição para extrair resumo, decisões, tarefas, prazos e uma mensagem pronta para o grupo.</ThemedText>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Título da reunião (opcional)"
                placeholderTextColor="#8b94a5"
                style={styles.titleInput}
                maxLength={200}
              />
              <TextInput
                value={transcript}
                onChangeText={setTranscript}
                placeholder="Cole aqui a transcrição da reunião…"
                placeholderTextColor="#8b94a5"
                style={styles.transcriptInput}
                multiline
                textAlignVertical="top"
                maxLength={100_000}
              />
              <ThemedText themeColor="textSecondary" type="small">Não inclua informações que você não tem autorização para compartilhar com seu provider de IA.</ThemedText>
              {error && <ThemedText style={styles.error}>{error}</ThemedText>}
              <Pressable disabled={transcript.trim().length < 30 || busy} style={[styles.primary, (transcript.trim().length < 30 || busy) && styles.disabled]} onPress={() => void organize()}>
                {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryText}>Gerar resumo da reunião</ThemedText>}
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText type="title" style={styles.title}>{title.trim() || 'Resumo da reunião'}</ThemedText>
              <Section title="Resumo"><ThemedText>{analysis.summary}</ThemedText></Section>
              <Section title="Decisões">
                {analysis.decisions.length ? analysis.decisions.map((item, i) => <ThemedText key={`d${i}`} style={styles.bullet}>• {item.text}{item.confidence === 'inferred' ? ' (confirmar)' : ''}</ThemedText>) : <ThemedText themeColor="textSecondary">Nenhuma decisão identificada.</ThemedText>}
              </Section>
              <Section title="Tarefas">
                {analysis.tasks.length ? analysis.tasks.map((item, i) => <ThemedText key={`t${i}`} style={styles.bullet}>• {item.assignee ?? 'Responsável não definido'} — {item.text}{item.dueDate ? ` — até ${item.dueDate}` : ''}{item.source === 'inferred' ? ' (confirmar)' : ''}</ThemedText>) : <ThemedText themeColor="textSecondary">Nenhuma tarefa identificada.</ThemedText>}
              </Section>
              <Section title="Pontos importantes">
                {analysis.importantPoints.length ? analysis.importantPoints.map((item, i) => <ThemedText key={`p${i}`} style={styles.bullet}>• {item}</ThemedText>) : <ThemedText themeColor="textSecondary">Nenhum ponto adicional.</ThemedText>}
              </Section>
              <Section title="Pendências">
                {analysis.pendingQuestions.length ? analysis.pendingQuestions.map((item, i) => <ThemedText key={`q${i}`} style={styles.bullet}>• {item}</ThemedText>) : <ThemedText themeColor="textSecondary">Nenhuma pendência identificada.</ThemedText>}
              </Section>
              <Section title="Mensagem para o grupo">
                <TextInput value={groupMessage} onChangeText={setGroupMessage} style={styles.messageInput} multiline textAlignVertical="top" />
                <View style={styles.actions}>
                  <Pressable style={styles.secondary} onPress={() => void copyMessage()}><Copy size={17} color="#e6e9ef" /><ThemedText>Copiar</ThemedText></Pressable>
                  <Pressable style={styles.secondary} onPress={() => void shareMessage()}><Share2 size={17} color="#e6e9ef" /><ThemedText>Compartilhar</ThemedText></Pressable>
                </View>
              </Section>
              <Pressable style={styles.secondary} onPress={() => setAnalysis(null)}><ThemedText>Editar transcrição</ThemedText></Pressable>
            </>
          )}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><ThemedText type="smallBold">{title}</ThemedText>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { flex: 1 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343a47' },
  back: { width: 42, height: 42, justifyContent: 'center' },
  headerText: { gap: 1 },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 14 },
  title: { fontSize: 28, lineHeight: 34, marginTop: 8 },
  titleInput: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: '#343a47', borderRadius: 10, color: '#f0f3fb' },
  transcriptInput: { minHeight: 240, padding: 12, borderWidth: 1, borderColor: '#343a47', borderRadius: 10, color: '#f0f3fb', fontSize: 15, lineHeight: 22 },
  messageInput: { minHeight: 130, padding: 12, borderWidth: 1, borderColor: '#343a47', borderRadius: 10, color: '#f0f3fb', fontSize: 15, lineHeight: 22 },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#526fd0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.45 },
  error: { color: '#f85149' },
  section: { gap: Spacing.two, padding: 14, borderRadius: 12, backgroundColor: '#171a21' },
  bullet: { lineHeight: 23 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  secondary: { minHeight: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#424957', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
