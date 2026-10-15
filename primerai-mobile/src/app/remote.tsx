import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, Trash2, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { api, type RemoteApproval, type RemoteTask, type RemoteTaskStatus } from '@/lib/api';
import { useSession } from '@/state/session';

/** o desktop só renomeia os status para texto legível na lista */
const STATUS_LABEL: Record<RemoteTaskStatus, string> = {
  pending: 'Na fila',
  running: 'Executando',
  waiting_approval: 'Aguardando aprovação',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const STATUS_COLOR: Record<RemoteTaskStatus, string> = {
  pending: '#8b94a5',
  running: '#6f8cff',
  waiting_approval: '#e3b341',
  completed: '#9bd6b0',
  failed: '#f85149',
  cancelled: '#8b94a5',
};

const POLL_MS = 3000;

export default function RemoteScreen() {
  const { session } = useSession();
  const accessToken = session?.accessToken;

  const [tasks, setTasks] = useState<RemoteTask[]>([]);
  const [approvals, setApprovals] = useState<Record<string, RemoteApproval>>({});
  const [taskActionId, setTaskActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // native tabs renderizam todas as telas no mount, então o poll só roda com a tela em foco
  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      let cancelled = false;
      const token = accessToken;

      const refresh = async () => {
        try {
          const recent = await api.listTasks(token);
          if (cancelled) return;
          setTasks(recent);
          const pending = recent.filter((task) => task.status === 'waiting_approval');
          const entries = await Promise.all(pending.map(async (task) => [task.id, await api.getTaskApproval(token, task.id)] as const));
          if (!cancelled) setApprovals(Object.fromEntries(entries));
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : 'não foi possível falar com o servidor');
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      void refresh();
      const timer = setInterval(() => void refresh(), POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [accessToken]),
  );

  async function cancelTask(task: RemoteTask) {
    if (!accessToken || taskActionId) return;
    setTaskActionId(task.id);
    setError(null);
    try {
      const updated = await api.cancelTask(accessToken, task.id);
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não foi possível cancelar a tarefa');
    } finally {
      setTaskActionId(null);
    }
  }

  async function deleteTask(task: RemoteTask) {
    if (!accessToken || taskActionId) return;
    setTaskActionId(task.id);
    setError(null);
    try {
      await api.deleteTask(accessToken, task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não foi possível apagar a tarefa');
    } finally {
      setTaskActionId(null);
    }
  }

  async function decideApproval(task: RemoteTask, approved: boolean) {
    const approval = approvals[task.id];
    if (!accessToken || !approval || taskActionId) return;
    setTaskActionId(task.id);
    setError(null);
    try {
      await api.resolveApproval(accessToken, approval.id, approved);
      setApprovals((current) => { const next = { ...current }; delete next[task.id]; return next; });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não foi possível decidir a aprovação');
    } finally {
      setTaskActionId(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao chat" hitSlop={10} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]} onPress={() => router.replace('/')}>
            <ChevronLeft size={30} color="#f2f5ff" />
          </Pressable>
          <ThemedText type="subtitle" style={styles.headerTitle}>Tarefas</ThemedText>
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <ScrollView contentContainerStyle={styles.list}>
            {loading && <ActivityIndicator />}
            {!loading && tasks.length === 0 && (
              <ThemedText themeColor="textSecondary">Nenhuma tarefa enviada ainda.</ThemedText>
            )}
            {tasks.map((task) => (
              <ThemedView key={task.id} type="backgroundElement" style={styles.taskCard}>
                <View style={styles.taskHead}>
                  <ThemedText type="smallBold" numberOfLines={2} style={styles.taskPrompt}>
                    {task.prompt}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: STATUS_COLOR[task.status] }}>
                    {STATUS_LABEL[task.status]}
                  </ThemedText>
                </View>
                {task.status === 'running' && (
                  <>
                    <ThemedText themeColor="textSecondary" type="small">
                      {task.stepLabel ?? 'Executando'} · {task.progress}%
                    </ThemedText>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.max(task.progress, 2)}%` }]} />
                    </View>
                  </>
                )}
                {task.stepLabel && task.status !== 'running' && (
                  <ThemedText themeColor="textSecondary" type="small">
                    {task.stepLabel}
                  </ThemedText>
                )}
                {task.status === 'waiting_approval' && approvals[task.id] && (
                  <View style={styles.approvalBox}>
                    <ThemedText type="smallBold">Confirme a movimentação</ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">{approvals[task.id].impactSummary}</ThemedText>
                    <View style={styles.approvalActions}>
                      <Pressable accessibilityRole="button" disabled={taskActionId !== null} style={styles.approveButton} onPress={() => void decideApproval(task, true)}><ThemedText style={styles.approveLabel}>{taskActionId === task.id ? 'Enviando…' : 'Aprovar'}</ThemedText></Pressable>
                      <Pressable accessibilityRole="button" disabled={taskActionId !== null} style={styles.denyButton} onPress={() => void decideApproval(task, false)}><ThemedText style={styles.denyLabel}>Recusar</ThemedText></Pressable>
                    </View>
                  </View>
                )}
                {task.output?.text && <ThemedText style={styles.taskOutput}>{task.output.text}</ThemedText>}
                {task.error && <ThemedText style={styles.taskError}>{task.error}</ThemedText>}
                <ThemedText themeColor="textSecondary" type="small">
                  {new Date(task.createdAt).toLocaleString('pt-BR')}
                </ThemedText>
                <View style={styles.taskActions}>
                  {['pending', 'running', 'waiting_approval'].includes(task.status) ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Cancelar tarefa: ${task.prompt}`} disabled={taskActionId !== null} style={styles.cancelTaskButton} onPress={() => void cancelTask(task)}>
                      <X size={16} color="#f0c36a" />
                      <ThemedText style={styles.cancelTaskLabel}>{taskActionId === task.id ? 'Cancelando…' : 'Cancelar'}</ThemedText>
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Apagar tarefa: ${task.prompt}`} disabled={taskActionId !== null} style={styles.deleteTaskButton} onPress={() => void deleteTask(task)}>
                      <Trash2 size={16} color="#ffb4ab" />
                      <ThemedText style={styles.deleteTaskLabel}>{taskActionId === task.id ? 'Apagando…' : 'Apagar'}</ThemedText>
                    </Pressable>
                  )}
                </View>
              </ThemedView>
            ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(122,138,180,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(226,234,255,0.30)',
    shadowColor: '#05070c',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  backButtonPressed: { opacity: 0.82, transform: [{ scale: 0.95 }] },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '500' },
  list: { gap: 10, paddingBottom: Spacing.three },
  taskCard: { gap: 8, padding: 12, borderRadius: 12 },
  taskHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskPrompt: { flex: 1 },
  taskOutput: { lineHeight: 21 },
  taskError: { color: '#f85149' },
  approvalBox: { gap: 8, padding: 10, borderRadius: 9, backgroundColor: '#383124' },
  approvalActions: { flexDirection: 'row', gap: 8 },
  approveButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#28563b' },
  approveLabel: { color: '#c9f6d5', fontWeight: '700' },
  denyButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#382927' },
  denyLabel: { color: '#ffb4ab', fontWeight: '700' },
  taskActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  cancelTaskButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: '#383124' },
  cancelTaskLabel: { color: '#f0c36a', fontWeight: '600' },
  deleteTaskButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: '#382927' },
  deleteTaskLabel: { color: '#ffb4ab', fontWeight: '600' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#2a313d', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6f8cff' },
  error: { color: '#f85149', paddingVertical: 6 },
});
