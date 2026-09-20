import React, { useEffect, useRef, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import SaveAltRoundedIcon from '@mui/icons-material/SaveAltRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import type { MetadataImportPlan } from '../../domain/metadata-import';
import type { AdvancedDeviceInfo, AdvancedTocPatchPreview, AdvancedTocWritePreview } from '../../application/contracts';
import type { ApplicationCommand } from '../../application/command-bus';
import { executeSessionEndingCommand } from '../../application/device-session-transition';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from '../../application/interactive-authorization';
import { downloadBlob, formatTimeFromSeconds } from '../../utils';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import {
    buildAdvancedExportFileName,
    defaultMetadataTrackSelection,
    getDiscMaintenanceConfirmationToken,
    getSelfTestReadiness,
    isDiscMaintenanceConfirmationValid,
    localizeSelfTestReadinessReason,
    type DiscMaintenanceAction,
} from './workbench-model';
import {
    advancedMaintenanceActions,
    canRunAdvancedMaintenanceAction,
    isAdvancedMaintenanceConfirmationValid,
    type AdvancedMaintenanceAction,
} from './workbench-advanced-maintenance';
import {
    canReviewRawTocWrite,
    inspectRawTocData,
    isRawTocConfirmationValid,
    isRawTocPatchConfirmationValid,
    rawTocPatchActions,
    RAW_TOC_CONFIRMATION,
    RAW_TOC_WRITABLE_SECTOR_COUNT,
    type RawTocPatchAction,
    type RawTocFileInspection,
} from './workbench-raw-toc';
import { WorkbenchTocEditor } from './workbench-toc-editor';
import { useI18n } from '../use-i18n';

function decodeBase64(data: string) {
    const binary = atob(data);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const WorkbenchTools = ({
    onMessage,
    onTaskStarted,
    onSessionEnded,
}: {
    onMessage(message: string): void;
    onTaskStarted(id: string, message: string): void;
    onSessionEnded(): void;
}) => {
    const { language, t } = useI18n();
    const client = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const device = workspace.device;
    const disc = device?.disc;
    const capabilities = device?.capabilities ?? [];
    const fileInput = useRef<HTMLInputElement>(null);
    const tocFileInput = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [sourceName, setSourceName] = useState('');
    const [sourceText, setSourceText] = useState('');
    const [plan, setPlan] = useState<MetadataImportPlan | null>(null);
    const [plannedRevision, setPlannedRevision] = useState<number | undefined>();
    const [includedTrackIndexes, setIncludedTrackIndexes] = useState<number[]>([]);
    const [advancedInfo, setAdvancedInfo] = useState<AdvancedDeviceInfo | null>(null);
    const [tocSummary, setTocSummary] = useState<{ bytes: number; sha256: string } | null>(null);
    const [selfTestOpen, setSelfTestOpen] = useState(false);
    const [selfTestConfirmation, setSelfTestConfirmation] = useState('');
    const [discMaintenanceReview, setDiscMaintenanceReview] = useState<{
        action: DiscMaintenanceAction;
        expectedSessionId: string;
        expectedRevision: number;
        discTitle: string;
        trackCount: number;
    } | null>(null);
    const [discMaintenanceConfirmation, setDiscMaintenanceConfirmation] = useState('');
    const [maintenanceAction, setMaintenanceAction] = useState<AdvancedMaintenanceAction | null>(null);
    const [maintenanceConfirmation, setMaintenanceConfirmation] = useState('');
    const [spUploadSpeedupEnabled, setSpUploadSpeedupEnabled] = useState(false);
    const [discSwapDetectionDisabled, setDiscSwapDetectionDisabled] = useState(false);
    const [rawTocReview, setRawTocReview] = useState<{
        sourceName: string;
        source: RawTocFileInspection;
        preview: AdvancedTocWritePreview;
        expectedSessionId: string;
        expectedRevision: number;
    } | null>(null);
    const [rawTocConfirmation, setRawTocConfirmation] = useState('');
    const [rawTocPatchReview, setRawTocPatchReview] = useState<{
        action: RawTocPatchAction;
        preview: AdvancedTocPatchPreview;
        expectedSessionId: string;
        expectedRevision: number;
    } | null>(null);
    const [rawTocPatchConfirmation, setRawTocPatchConfirmation] = useState('');
    const [tocEditorOpen, setTocEditorOpen] = useState(false);

    const canImportMetadata =
        Boolean(disc?.writable) &&
        capabilities.includes('disc.rename') &&
        (capabilities.includes('track.rename') || capabilities.includes('metadata.himd')) &&
        capabilities.includes('group.rename') &&
        capabilities.includes('group.create') &&
        capabilities.includes('group.delete');
    const selfTestReadiness = getSelfTestReadiness(device ?? undefined);
    const discIsWritable = Boolean(disc?.writable && !disc.writeProtected);
    const canEraseDisc = discIsWritable && capabilities.includes('disc.erase');
    const canFormatHimd = discIsWritable && capabilities.includes('disc.formatHimd');

    useEffect(() => {
        setAdvancedInfo(null);
        setTocSummary(null);
        setDiscMaintenanceReview(null);
        setDiscMaintenanceConfirmation('');
        setMaintenanceAction(null);
        setMaintenanceConfirmation('');
        setSpUploadSpeedupEnabled(false);
        setDiscSwapDetectionDisabled(false);
        setRawTocReview(null);
        setRawTocConfirmation('');
        setRawTocPatchReview(null);
        setRawTocPatchConfirmation('');
        setTocEditorOpen(false);
    }, [device?.sessionId]);

    useEffect(() => {
        setDiscMaintenanceReview(null);
        setDiscMaintenanceConfirmation('');
        setRawTocReview(null);
        setRawTocConfirmation('');
        setRawTocPatchReview(null);
        setRawTocPatchConfirmation('');
    }, [device?.revision]);

    const openDiscMaintenanceReview = (action: DiscMaintenanceAction) => {
        if (!device || !disc) return;
        if (action === 'erase' ? !canEraseDisc : !canFormatHimd) return;
        setDiscMaintenanceConfirmation('');
        setDiscMaintenanceReview({
            action,
            expectedSessionId: device.sessionId,
            expectedRevision: device.revision,
            discTitle: disc.title || disc.fullWidthTitle || 'Untitled MiniDisc',
            trackCount: disc.trackCount,
        });
    };

    const closeDiscMaintenanceReview = () => {
        if (busy) return;
        setDiscMaintenanceReview(null);
        setDiscMaintenanceConfirmation('');
    };

    const runDiscMaintenance = async () => {
        if (!discMaintenanceReview) return;
        if (!isDiscMaintenanceConfirmationValid(discMaintenanceReview.action, discMaintenanceConfirmation)) return;
        const currentDevice = client.getWorkspaceSnapshot().device;
        if (
            currentDevice?.sessionId !== discMaintenanceReview.expectedSessionId ||
            currentDevice.revision !== discMaintenanceReview.expectedRevision
        ) {
            setStatus(t('The connected device or disc changed after this review opened. Review the operation again.'));
            setDiscMaintenanceReview(null);
            setDiscMaintenanceConfirmation('');
            return;
        }
        setBusy(true);
        setStatus(t(discMaintenanceReview.action === 'erase' ? 'Erasing the MiniDisc…' : 'Formatting the disc as Hi-MD…'));
        try {
            const result = await client.execute(
                discMaintenanceReview.action === 'erase'
                    ? {
                          type: 'disc.erase',
                          confirmation: {
                              confirmed: true,
                              reason: 'Confirmed in Studio Workbench after reviewing permanent removal of all disc content.',
                          },
                          expectedRevision: discMaintenanceReview.expectedRevision,
                      }
                    : {
                          type: 'disc.formatHimd',
                          confirmation: {
                              confirmed: true,
                              reason: 'Confirmed in Studio Workbench after reviewing destructive Hi-MD formatting.',
                          },
                          expectedRevision: discMaintenanceReview.expectedRevision,
                      }
            );
            if (!result.ok) throw new Error(result.error.message);
            const action = discMaintenanceReview.action;
            setDiscMaintenanceReview(null);
            setDiscMaintenanceConfirmation('');
            setStatus(null);
            onMessage(t(action === 'erase' ? 'MiniDisc erased.' : 'MiniDisc formatted as Hi-MD.'));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not complete disc maintenance.'));
        } finally {
            setBusy(false);
        }
    };

    const closeSelfTest = () => {
        if (busy) return;
        setSelfTestOpen(false);
        setSelfTestConfirmation('');
    };

    const closeMaintenanceReview = () => {
        if (busy) return;
        setMaintenanceAction(null);
        setMaintenanceConfirmation('');
    };

    const closeRawTocReview = () => {
        if (busy) return;
        setRawTocReview(null);
        setRawTocConfirmation('');
    };

    const closeRawTocPatchReview = () => {
        if (busy) return;
        setRawTocPatchReview(null);
        setRawTocPatchConfirmation('');
    };

    const exportCsv = async () => {
        setBusy(true);
        setStatus(t('Preparing metadata export…'));
        try {
            const result = await client.execute({ type: 'metadata.exportCsv' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.metadataCsv) throw new Error(t('Metadata export did not return a CSV document.'));
            downloadBlob(
                new Blob([result.metadataCsv.text], { type: 'text/csv;charset=utf-8' }),
                result.metadataCsv.fileName
            );
            setStatus(null);
            onMessage(language === 'zh-CN' ? `已保存 ${result.metadataCsv.fileName}。` : `Saved ${result.metadataCsv.fileName}.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not export disc metadata.'));
        } finally {
            setBusy(false);
        }
    };

    const chooseCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !device) return;
        const expectedRevision = device.revision;
        setBusy(true);
        setStatus(language === 'zh-CN' ? `正在检查 ${file.name}…` : `Checking ${file.name}…`);
        setPlan(null);
        try {
            const text = await file.text();
            const result = await client.execute({ type: 'metadata.planCsv', text });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.metadataPlan) throw new Error(t('Metadata import did not return a validation plan.'));
            setSourceName(file.name);
            setSourceText(text);
            setPlan(result.metadataPlan);
            setPlannedRevision(expectedRevision);
            setIncludedTrackIndexes(defaultMetadataTrackSelection(result.metadataPlan));
            setStatus(null);
        } catch (error) {
            setSourceName(file.name);
            setSourceText('');
            setPlannedRevision(undefined);
            setIncludedTrackIndexes([]);
            setStatus(error instanceof Error ? error.message : t('Could not read the metadata file.'));
        } finally {
            setBusy(false);
        }
    };

    const toggleTrack = (index: number) => {
        setIncludedTrackIndexes((current) =>
            current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b)
        );
    };

    const applyCsv = async () => {
        if (!plan || !sourceText || plannedRevision === undefined) return;
        setBusy(true);
        setStatus(t('Applying reviewed metadata…'));
        try {
            const result = await client.execute({
                type: 'metadata.applyCsv',
                text: sourceText,
                includedTrackIndexes,
                expectedRevision: plannedRevision,
            });
            if (!result.ok) throw new Error(result.error.message);
            setPlan(null);
            setSourceName('');
            setSourceText('');
            setIncludedTrackIndexes([]);
            setPlannedRevision(undefined);
            setStatus(null);
            onMessage(language === 'zh-CN'
                ? `已应用碟片元数据和 ${includedTrackIndexes.length} 项已审阅的曲目更新。`
                : `Applied disc metadata and ${includedTrackIndexes.length} reviewed track update${includedTrackIndexes.length === 1 ? '' : 's'}.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not apply the metadata file.'));
        } finally {
            setBusy(false);
        }
    };

    const inspectDevice = async () => {
        setBusy(true);
        setStatus(t('Reading device firmware and advanced capabilities…'));
        try {
            const result = await client.execute({ type: 'advanced.inspect' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedInfo) throw new Error(t('The device did not return advanced information.'));
            setAdvancedInfo(result.advancedInfo);
            setStatus(null);
        } catch (error) {
            setAdvancedInfo(null);
            setStatus(error instanceof Error ? error.message : t('Could not inspect the device.'));
        } finally {
            setBusy(false);
        }
    };

    const startSelfTest = async () => {
        if (selfTestConfirmation !== 'ERASE') return;
        setBusy(true);
        setStatus(t('Starting the destructive device self-test…'));
        try {
            const result = await client.execute({
                type: 'diagnostics.selfTest',
                confirmation: {
                    confirmed: true,
                    reason: 'Confirmed in Studio Workbench after reviewing that the self-test erases the entire disc.',
                },
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.task) throw new Error(t('The device self-test did not return a task.'));
            setSelfTestOpen(false);
            setSelfTestConfirmation('');
            setStatus(null);
            onTaskStarted(result.task.id, t('Device self-test started. The test disc will be erased if all steps complete.'));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not start the device self-test.'));
        } finally {
            setBusy(false);
        }
    };

    const exportRawToc = async () => {
        if (!device || !disc) return;
        setBusy(true);
        setStatus(t('Reading six raw TOC sectors…'));
        try {
            const result = await client.execute({ type: 'advanced.readToc' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedToc) throw new Error(t('The device did not return a raw TOC backup.'));
            const data = decodeBase64(result.advancedToc.dataBase64);
            const fileName = buildAdvancedExportFileName('toc', disc.title || device.deviceName);
            downloadBlob(new Blob([data], { type: 'application/octet-stream' }), fileName);
            setTocSummary({ bytes: result.advancedToc.byteLength, sha256: result.advancedToc.sha256 });
            setStatus(null);
            onMessage(language === 'zh-CN'
                ? `已保存 ${fileName}，SHA-256 为 ${result.advancedToc.sha256.slice(0, 12)}…。`
                : `Saved ${fileName} with SHA-256 ${result.advancedToc.sha256.slice(0, 12)}….`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not export the raw TOC.'));
        } finally {
            setBusy(false);
        }
    };

    const chooseRawToc = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !device || !disc) return;
        const expectedSessionId = device.sessionId;
        const expectedRevision = device.revision;
        setBusy(true);
        setStatus(language === 'zh-CN' ? `正在将 ${file.name} 与当前碟片比较…` : `Checking ${file.name} against the inserted disc…`);
        setRawTocReview(null);
        setRawTocConfirmation('');
        try {
            const source = await inspectRawTocData(new Uint8Array(await file.arrayBuffer()));
            const result = await client.execute({ type: 'advanced.previewTocWrite', dataBase64: source.dataBase64 });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedTocWritePreview) throw new Error(t('The device did not return a raw TOC write preview.'));
            const latest = client.getWorkspaceSnapshot().device;
            if (latest?.sessionId !== expectedSessionId || latest.revision !== expectedRevision) {
                throw new Error(t('The connected device or disc changed while the TOC file was being checked. Choose it again.'));
            }
            setRawTocReview({
                sourceName: file.name,
                source,
                preview: result.advancedTocWritePreview,
                expectedSessionId,
                expectedRevision,
            });
            setStatus(null);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not review the raw TOC backup.'));
        } finally {
            setBusy(false);
        }
    };

    const writeRawToc = async () => {
        if (!rawTocReview || !isRawTocConfirmationValid(rawTocConfirmation)) return;
        const latest = client.getWorkspaceSnapshot().device;
        if (
            latest?.sessionId !== rawTocReview.expectedSessionId ||
            latest.revision !== rawTocReview.expectedRevision
        ) {
            setStatus(t('The connected device or disc changed after this TOC was reviewed. Choose the file again.'));
            setRawTocReview(null);
            setRawTocConfirmation('');
            return;
        }
        setBusy(true);
        setStatus(t('Writing the reviewed raw TOC…'));
        try {
            const result = await client.execute({
                type: 'advanced.writeToc',
                dataBase64: rawTocReview.source.dataBase64,
                confirmation: {
                    confirmed: true,
                    reason: 'Confirmed in Studio Workbench after comparing the source and current raw TOC checksums.',
                },
                expectedRevision: rawTocReview.expectedRevision,
                expectedCurrentTocSha256: rawTocReview.preview.currentSha256,
                interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.snapshot) throw new Error(t('Writing the raw TOC did not return the refreshed device state.'));
            const sourceName = rawTocReview.sourceName;
            setRawTocReview(null);
            setRawTocConfirmation('');
            setStatus(null);
            onMessage(language === 'zh-CN' ? `已写入 ${sourceName} 中审阅过的扇区并刷新碟片。` : `Wrote the reviewed sectors from ${sourceName} and refreshed the disc.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not write the raw TOC.'));
        } finally {
            setBusy(false);
        }
    };

    const previewRawTocPatch = async (action: RawTocPatchAction) => {
        if (!device || !disc) return;
        const expectedSessionId = device.sessionId;
        const expectedRevision = device.revision;
        setBusy(true);
        setStatus(language === 'zh-CN' ? `正在审阅“${t(action.label)}”…` : `Reviewing ${action.label.toLowerCase()}…`);
        setRawTocPatchReview(null);
        setRawTocPatchConfirmation('');
        try {
            const result = await client.execute({ type: 'advanced.previewTocPatch', kind: action.kind });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedTocPatch) throw new Error(t('The device did not return a raw TOC change preview.'));
            const latest = client.getWorkspaceSnapshot().device;
            if (latest?.sessionId !== expectedSessionId || latest.revision !== expectedRevision) {
                throw new Error(t('The connected device or disc changed while the TOC flags were being reviewed. Review them again.'));
            }
            setRawTocPatchReview({ action, preview: result.advancedTocPatch, expectedSessionId, expectedRevision });
            setStatus(null);
        } catch (error) {
            setStatus(error instanceof Error
                ? error.message
                : language === 'zh-CN'
                  ? `无法审阅“${t(action.label)}”。`
                  : `Could not review ${action.label.toLowerCase()}.`);
        } finally {
            setBusy(false);
        }
    };

    const applyRawTocPatch = async () => {
        if (!rawTocPatchReview || !isRawTocPatchConfirmationValid(rawTocPatchReview.action, rawTocPatchConfirmation)) return;
        const latest = client.getWorkspaceSnapshot().device;
        if (
            latest?.sessionId !== rawTocPatchReview.expectedSessionId ||
            latest.revision !== rawTocPatchReview.expectedRevision
        ) {
            setStatus(t('The connected device or disc changed after this TOC change was reviewed. Review it again.'));
            setRawTocPatchReview(null);
            setRawTocPatchConfirmation('');
            return;
        }
        setBusy(true);
        setStatus(language === 'zh-CN' ? `正在应用“${t(rawTocPatchReview.action.label)}”…` : `Applying ${rawTocPatchReview.action.label.toLowerCase()}…`);
        try {
            const result = await client.execute({
                type: 'advanced.applyTocPatch',
                kind: rawTocPatchReview.action.kind,
                expectedCurrentTocSha256: rawTocPatchReview.preview.currentSha256,
                confirmation: {
                    confirmed: true,
                    reason: `Confirmed ${rawTocPatchReview.action.label} in the Studio Workbench raw TOC review.`,
                },
                expectedRevision: rawTocPatchReview.expectedRevision,
                interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.snapshot) throw new Error(t('Changing the raw TOC flags did not return the refreshed device state.'));
            const label = rawTocPatchReview.action.label;
            setRawTocPatchReview(null);
            setRawTocPatchConfirmation('');
            setStatus(null);
            onMessage(language === 'zh-CN' ? `“${t(label)}”已完成，碟片已刷新。` : `${label} completed and the disc was refreshed.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not change the raw TOC flags.'));
        } finally {
            setBusy(false);
        }
    };

    const exportAdvancedMemory = async (kind: 'ram' | 'firmware') => {
        if (!device) return;
        setBusy(true);
        setStatus(language === 'zh-CN' ? `正在开始导出${kind === 'ram' ? ' RAM' : '固件'}…` : `Starting ${kind === 'ram' ? 'RAM' : 'firmware'} export…`);
        try {
            const task = await client.startLocalAdvancedMemoryExport(kind, (region, data) => {
                const prefix = region === 'ROM' ? 'firmware' : region.toLowerCase();
                const fileName = buildAdvancedExportFileName(prefix, device.deviceName, advancedInfo?.firmwareVersion);
                downloadBlob(new Blob([new Uint8Array(data)], { type: 'application/octet-stream' }), fileName);
            });
            setStatus(null);
            onTaskStarted(task.id, language === 'zh-CN'
                ? `${kind === 'ram' ? 'RAM' : '固件'}导出已开始。保存完所有区域前请保持设备连接。`
                : `${kind === 'ram' ? 'RAM' : 'Firmware'} export started. Keep the device connected until every region is saved.`);
        } catch (error) {
            setStatus(error instanceof Error
                ? error.message
                : language === 'zh-CN'
                  ? `无法开始${kind === 'ram' ? ' RAM' : '固件'}导出。`
                  : `Could not start the ${kind} export.`);
        } finally {
            setBusy(false);
        }
    };

    const runAdvancedMaintenance = async () => {
        if (!maintenanceAction || !isAdvancedMaintenanceConfirmationValid(maintenanceAction, maintenanceConfirmation)) return;
        setBusy(true);
        setStatus(language === 'zh-CN' ? `正在应用“${t(maintenanceAction.label)}”…` : `Applying ${maintenanceAction.label}…`);
        try {
            let command: ApplicationCommand;
            switch (maintenanceAction.id) {
                case 'sp-speedup':
                    command = {
                        type: 'advanced.setSpUploadSpeedup',
                        enabled: !spUploadSpeedupEnabled,
                        interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
                    };
                    break;
                case 'disc-swap':
                    command = {
                        type: 'advanced.setDiscSwapDetectionDisabled',
                        disabled: !discSwapDetectionDisabled,
                        interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
                    };
                    break;
                case 'himd-full':
                    command = {
                        type: 'advanced.enableHimdFullMode',
                        confirmation: { confirmed: true, reason: 'Confirmed in the Studio Workbench advanced maintenance review.' },
                        interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
                    };
                    break;
                case 'service-mode':
                    command = {
                        type: 'advanced.enterServiceMode',
                        confirmation: { confirmed: true, reason: 'Confirmed in the Studio Workbench advanced maintenance review.' },
                        interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
                    };
                    break;
            }

            if (maintenanceAction.endsSession) {
                await executeSessionEndingCommand(client, command);
                setMaintenanceAction(null);
                setMaintenanceConfirmation('');
                setStatus(null);
                onSessionEnded();
                return;
            }

            const result = await client.execute(command);
            if (!result.ok) throw new Error(result.error.message);
            if (maintenanceAction.id === 'sp-speedup') setSpUploadSpeedupEnabled((enabled) => !enabled);
            if (maintenanceAction.id === 'disc-swap') setDiscSwapDetectionDisabled((disabled) => !disabled);
            const label = maintenanceAction.label;
            setMaintenanceAction(null);
            setMaintenanceConfirmation('');
            setStatus(null);
            onMessage(language === 'zh-CN' ? `当前设备会话的“${t(label)}”已更新。` : `${label} updated for this device session.`);
        } catch (error) {
            setStatus(error instanceof Error
                ? error.message
                : language === 'zh-CN'
                  ? `无法应用“${t(maintenanceAction.label)}”。`
                  : `Could not apply ${maintenanceAction.label}.`);
        } finally {
            setBusy(false);
        }
    };

    const maintenanceButtonLabel = (action: AdvancedMaintenanceAction) => {
        if (action.id === 'sp-speedup') return t(spUploadSpeedupEnabled ? 'Disable speedup' : 'Enable speedup');
        if (action.id === 'disc-swap') return t(discSwapDetectionDisabled ? 'Restore detection' : 'Disable detection');
        return t(action.label);
    };

    return (
        <section className="workbench__tools">
            <header>
                <div><span className="workbench__eyebrow">{t('TOOLS')}</span><h2>{t('Disc and device tools')}</h2><p>{t('Back up metadata and low-level device information before making maintenance changes.')}</p></div>
            </header>

            <div className="workbench__tools-grid">
                <article className="workbench__tool-card">
                    <DownloadRoundedIcon />
                    <div><h3>{t('Export metadata')}</h3><p>{t('Save the disc title, track titles, full-width titles, Hi-MD fields, encoding details and group ranges.')}</p></div>
                    <button className="secondary-button" onClick={() => void exportCsv()} disabled={!disc || busy}><DownloadRoundedIcon /> {t('Export CSV')}</button>
                </article>
                <article className="workbench__tool-card">
                    <UploadFileRoundedIcon />
                    <div><h3>{t('Import metadata')}</h3><p>{t('Choose a CSV to compare it with the inserted disc. Nothing is written until you review and apply the plan.')}</p></div>
                    <button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={!canImportMetadata || busy}><UploadFileRoundedIcon /> {t('Choose CSV')}</button>
                    <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => void chooseCsv(event)} />
                </article>
                {(capabilities.includes('disc.erase') || capabilities.includes('disc.formatHimd')) ? (
                    <article className="workbench__tool-card is-danger workbench__maintenance-card">
                        <DeleteForeverRoundedIcon />
                        <div><h3>{t('Disc maintenance')}</h3><p>{t('Erase every track and group, or format a compatible disc as Hi-MD. Both operations permanently remove the current contents.')}</p><small>{t(discIsWritable ? 'Only operations supported by the connected device are shown.' : 'The inserted disc is read-only or write-protected.')}</small></div>
                        <div className="workbench__maintenance-actions">
                            {capabilities.includes('disc.erase') ? <button className="danger-button" onClick={() => openDiscMaintenanceReview('erase')} disabled={!canEraseDisc || busy}>{t('Erase MiniDisc')}</button> : null}
                            {capabilities.includes('disc.formatHimd') ? <button className="danger-button" onClick={() => openDiscMaintenanceReview('formatHimd')} disabled={!canFormatHimd || busy}>{t('Format as Hi-MD')}</button> : null}
                        </div>
                    </article>
                ) : null}
                <article className="workbench__tool-card">
                    <MemoryRoundedIcon />
                    <div><h3>{t('Device information')}</h3><p>{t('Read the firmware version and supported Homebrew capabilities without changing disc content.')}</p></div>
                    <button className="secondary-button" onClick={() => void inspectDevice()} disabled={!capabilities.includes('advanced.factory') || busy}><MemoryRoundedIcon /> {t('Inspect device')}</button>
                </article>
                <article className="workbench__tool-card">
                    <DataObjectRoundedIcon />
                    <div><h3>{t('Raw TOC backup')}</h3><p>{t('Save all six 2,352-byte TOC sectors with a SHA-256 checksum. This is read-only.')}</p>{tocSummary ? <small>{tocSummary.bytes.toLocaleString()} bytes · SHA-256 {tocSummary.sha256.slice(0, 16)}…</small> : null}</div>
                    <button className="secondary-button" onClick={() => void exportRawToc()} disabled={!disc || !capabilities.includes('advanced.factory') || busy}><SaveAltRoundedIcon /> {t('Export TOC')}</button>
                </article>
                <article className="workbench__tool-card is-danger">
                    <UploadFileRoundedIcon />
                    <div><h3>{t('Restore raw TOC')}</h3><p>{t('Compare a six-sector backup with the inserted disc before writing the four writable UTOC sectors.')}</p><small>{t(advancedInfo ? 'Requires the flushUTOC capability and a writable disc.' : 'Inspect the device before choosing a backup.')}</small></div>
                    <button className="danger-button" onClick={() => tocFileInput.current?.click()} disabled={!canReviewRawTocWrite(disc, advancedInfo?.capabilities) || busy}><UploadFileRoundedIcon /> {t('Choose TOC')}</button>
                    <input ref={tocFileInput} type="file" accept=".bin,application/octet-stream" hidden onChange={(event) => void chooseRawToc(event)} />
                </article>
                <article className="workbench__tool-card is-danger workbench__maintenance-card">
                    <TuneRoundedIcon />
                    <div><h3>{t('Track protection flags')}</h3><p>{t('Preview targeted raw TOC changes for SCMS permissions or track writability.')}</p><small>{t(advancedInfo ? 'Requires the flushUTOC capability and a writable disc.' : 'Inspect the device before reviewing a change.')}</small></div>
                    <div className="workbench__maintenance-actions">
                        {rawTocPatchActions.map((action) => (
                            <button className="danger-button" key={action.kind} onClick={() => void previewRawTocPatch(action)} disabled={!canReviewRawTocWrite(disc, advancedInfo?.capabilities) || busy}>{t(action.label)}</button>
                        ))}
                    </div>
                </article>
                <article className="workbench__tool-card is-danger">
                    <GridViewRoundedIcon />
                    <div><h3>{t('Visual TOC editor')}</h3><p>{t('Inspect and edit all four writable UTOC maps, content tables, header fields and free-list pointers in a local draft.')}</p><small>{t(advancedInfo ? 'Requires the flushUTOC capability and a writable disc. Every write receives a checksum review.' : 'Inspect the device before opening the editor.')}</small></div>
                    <button className="danger-button" onClick={() => setTocEditorOpen(true)} disabled={!canReviewRawTocWrite(disc, advancedInfo?.capabilities) || busy}><GridViewRoundedIcon /> {t('Open editor')}</button>
                </article>
                <article className="workbench__tool-card">
                    <SaveAltRoundedIcon />
                    <div><h3>{t('Device memory backup')}</h3><p>{t('Export supported RAM and firmware regions through an observable background task.')}</p><small>{t(advancedInfo ? 'Availability is based on the inspected firmware.' : 'Inspect the device first to discover supported readers.')}</small></div>
                    <div className="workbench__tool-actions">
                        <button className="secondary-button" onClick={() => void exportAdvancedMemory('ram')} disabled={!advancedInfo?.capabilities.includes('readRam') || busy}>RAM</button>
                        <button className="secondary-button" onClick={() => void exportAdvancedMemory('firmware')} disabled={!advancedInfo?.capabilities.includes('readFirmware') || busy}>{t('Firmware')}</button>
                    </div>
                </article>
                <article className="workbench__tool-card is-danger workbench__maintenance-card">
                    <TuneRoundedIcon />
                    <div><h3>{t('Advanced device modes')}</h3><p>{t('Review browser-authorized Homebrew patches and session-ending device modes.')}</p><small>{t(advancedInfo ? 'Only actions supported by this firmware are enabled.' : 'Inspect the device before reviewing an action.')}</small></div>
                    <div className="workbench__maintenance-actions">
                        {advancedMaintenanceActions.map((action) => (
                            <button
                                className={action.endsSession ? 'danger-button' : 'secondary-button'}
                                key={action.id}
                                onClick={() => { setMaintenanceAction(action); setMaintenanceConfirmation(''); }}
                                disabled={busy || !canRunAdvancedMaintenanceAction(action, advancedInfo?.capabilities)}
                            >
                                {maintenanceButtonLabel(action)}
                            </button>
                        ))}
                    </div>
                </article>
                <article className="workbench__tool-card is-danger">
                    <BugReportRoundedIcon />
                    <div><h3>{t('Destructive device self-test')}</h3><p>{t('Verify titles, ordering, playback, deletion and erase behavior. The inserted disc will be emptied.')}</p><small>{localizeSelfTestReadinessReason(selfTestReadiness.reason, language)}</small></div>
                    <button className="danger-button" onClick={() => setSelfTestOpen(true)} disabled={!selfTestReadiness.ready || busy}><BugReportRoundedIcon /> {t('Review self-test')}</button>
                </article>
            </div>

            {advancedInfo ? (
                <section className="workbench__device-inspection">
                    <div><span className="workbench__eyebrow">{t('DEVICE INSPECTION')}</span><h3>{advancedInfo.firmwareVersion || t('Unknown firmware')}</h3></div>
                    <div>{advancedInfo.capabilities.length > 0 ? advancedInfo.capabilities.map((capability) => <span key={capability}>{capability}</span>) : <span>{t('No advanced capabilities reported')}</span>}</div>
                </section>
            ) : null}

            {!disc ? <div className="workbench__tools-empty"><TuneRoundedIcon /><strong>{t('Connect a device and insert a disc to use metadata tools.')}</strong></div> : null}
            {disc && !canImportMetadata ? <div className="workbench__tools-warning"><WarningAmberRoundedIcon /><span>{t('This disc or device does not support the complete title and group import workflow. Export remains available.')}</span></div> : null}
            {status ? <div className="workbench__tools-warning"><WarningAmberRoundedIcon /><span>{status}</span></div> : null}

            {plan ? (
                <section className="workbench__metadata-review" aria-label={t('Metadata import review')}>
                    <header>
                        <div><span className="workbench__eyebrow">{t('IMPORT REVIEW')}</span><h3>{sourceName}</h3><p>{t('The disc title is always applied. Select only tracks whose title and group information should be replaced.')}</p></div>
                        <span className={plan.trackCountMatches ? 'is-compatible' : 'is-warning'}>{plan.trackCountMatches ? <CheckCircleRoundedIcon /> : <WarningAmberRoundedIcon />}{language === 'zh-CN' ? `文件 ${plan.expectedTrackCount} 首 · 碟片 ${plan.disc.trackCount} 首` : `${plan.expectedTrackCount} file tracks · ${plan.disc.trackCount} disc tracks`}</span>
                    </header>
                    <dl className="workbench__metadata-summary">
                        <div><dt>{t('Current disc title')}</dt><dd>{plan.disc.title || plan.disc.fullWidthTitle || t('Untitled')}</dd></div>
                        <div><dt>{t('New disc title')}</dt><dd>{plan.discTitle.title || plan.discTitle.fullWidthTitle || t('Untitled')}</dd></div>
                        <div><dt>{t('Compatible tracks')}</dt><dd>{plan.tracks.filter((track) => track.actual && track.matchesDisc).length}</dd></div>
                        <div><dt>{t('Needs review')}</dt><dd>{plan.tracks.filter((track) => track.actual && !track.matchesDisc).length}</dd></div>
                    </dl>
                    {!plan.trackCountMatches ? <div className="workbench__tools-warning"><WarningAmberRoundedIcon /><span>{t('The file and current disc have different track counts. Missing tracks cannot be selected.')}</span></div> : null}
                    <div className="workbench__metadata-actions">
                        <button className="secondary-button" onClick={() => setIncludedTrackIndexes(defaultMetadataTrackSelection(plan))}>{t('Select compatible')}</button>
                        <button className="secondary-button" onClick={() => setIncludedTrackIndexes([])}>{t('Clear tracks')}</button>
                        <span>{language === 'zh-CN' ? `已选 ${includedTrackIndexes.length} 首` : `${includedTrackIndexes.length} selected`}</span>
                    </div>
                    <div className="workbench__metadata-list">
                        <div className="workbench__metadata-list-head"><span /><span>{t('Track from file')}</span><span>{t('Current disc')}</span><span>{t('Result')}</span></div>
                        {plan.tracks.map((track) => {
                            const selected = includedTrackIndexes.includes(track.trackIndex);
                            const actual = track.actual;
                            return (
                                <label className={`workbench__metadata-row ${!actual || !track.matchesDisc ? 'has-warning' : ''}`} key={`${track.line}:${track.trackIndex}`}>
                                    <input type="checkbox" checked={selected} disabled={!actual || busy} onChange={() => toggleTrack(track.trackIndex)} />
                                    <span><b>{track.index}. {track.title || t('Untitled')}</b><small>{formatTimeFromSeconds(track.duration)} · {track.codec}{track.bitrate ? ` ${track.bitrate} kbps` : ''}{track.groupName ? ` · ${track.groupName}` : ''}</small></span>
                                    <span>{actual ? <><b>{actual.index + 1}. {actual.title || t('Untitled')}</b><small>{formatTimeFromSeconds(actual.duration)} · {actual.encoding.codec}{actual.encoding.bitrate ? ` ${actual.encoding.bitrate} kbps` : ''}</small></> : <><b>{t('Missing')}</b><small>{t('No matching track on this disc')}</small></>}</span>
                                    <span className={track.matchesDisc ? 'is-compatible' : 'is-warning'}>{track.matchesDisc ? <><CheckCircleRoundedIcon /> {t('Compatible')}</> : <><WarningAmberRoundedIcon /> {t('Review')}</>}</span>
                                </label>
                            );
                        })}
                    </div>
                    <footer>
                        <button className="secondary-button" onClick={() => { setPlan(null); setSourceText(''); setSourceName(''); }} disabled={busy}>{t('Discard')}</button>
                        <button className="primary-button" onClick={() => void applyCsv()} disabled={busy || !canImportMetadata}>{t('Apply reviewed metadata')}</button>
                    </footer>
                </section>
            ) : null}

            {discMaintenanceReview ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={closeDiscMaintenanceReview}>
                    <section className="workbench__modal workbench__maintenance-modal" role="alertdialog" aria-modal="true" aria-labelledby="workbench-disc-maintenance-title" aria-describedby="workbench-disc-maintenance-description" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">{t('DESTRUCTIVE DISC MAINTENANCE')}</span>
                        <h2 id="workbench-disc-maintenance-title">{t(discMaintenanceReview.action === 'erase' ? 'Erase this MiniDisc?' : 'Format this disc as Hi-MD?')}</h2>
                        <p id="workbench-disc-maintenance-description">{t(discMaintenanceReview.action === 'erase' ? 'Every track, group and title on this MiniDisc will be permanently removed.' : 'Formatting changes the disc to Hi-MD and permanently removes all current tracks, groups and titles.')}</p>
                        <div className="workbench__write-warning">
                            {language === 'zh-CN'
                                ? `“${discMaintenanceReview.discTitle}”当前包含 ${discMaintenanceReview.trackCount} 首曲目。此操作无法撤销。`
                                : `“${discMaintenanceReview.discTitle}” currently contains ${discMaintenanceReview.trackCount} track${discMaintenanceReview.trackCount === 1 ? '' : 's'}. This cannot be undone.`}
                        </div>
                        <label>
                            {language === 'zh-CN'
                                ? `输入 ${getDiscMaintenanceConfirmationToken(discMaintenanceReview.action)} 以继续`
                                : `Type ${getDiscMaintenanceConfirmationToken(discMaintenanceReview.action)} to continue`}
                            <input autoFocus value={discMaintenanceConfirmation} onChange={(event) => setDiscMaintenanceConfirmation(event.target.value)} />
                        </label>
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={closeDiscMaintenanceReview} disabled={busy}>{t('Keep disc contents')}</button>
                            <button className="danger-button" onClick={() => void runDiscMaintenance()} disabled={busy || !isDiscMaintenanceConfirmationValid(discMaintenanceReview.action, discMaintenanceConfirmation)}>
                                <DeleteForeverRoundedIcon /> {t(discMaintenanceReview.action === 'erase' ? 'Erase MiniDisc' : 'Format as Hi-MD')}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {selfTestOpen ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={closeSelfTest}>
                    <section className="workbench__modal workbench__self-test-modal" role="dialog" aria-modal="true" aria-labelledby="workbench-self-test-title" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">{t('DESTRUCTIVE DIAGNOSTIC')}</span>
                        <h2 id="workbench-self-test-title">{t('Erase this disc and run 14 device checks?')}</h2>
                        <p>{t('The test renames the disc and its first two tracks, changes full-width titles, moves tracks, tests playback controls, deletes a track, then erases the entire disc.')}</p>
                        <div className="workbench__write-warning">{language === 'zh-CN' ? `“${disc?.title || '无标题 MiniDisc'}”上的所有曲目都将被永久删除。请只使用可随意擦除的测试碟。` : `Every track currently on “${disc?.title || 'Untitled MiniDisc'}” will be permanently deleted. Use only a disposable test disc.`}</div>
                        <label>{t('Type ERASE to enable the test')}<input autoFocus value={selfTestConfirmation} onChange={(event) => setSelfTestConfirmation(event.target.value)} /></label>
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={closeSelfTest} disabled={busy}>{t('Cancel')}</button>
                            <button className="danger-button" onClick={() => void startSelfTest()} disabled={busy || selfTestConfirmation !== 'ERASE'}>{t('Erase disc and run test')}</button>
                        </div>
                    </section>
                </div>
            ) : null}

            {maintenanceAction ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={closeMaintenanceReview}>
                    <section className="workbench__modal workbench__maintenance-modal" role="dialog" aria-modal="true" aria-labelledby="workbench-maintenance-title" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">{t('ADVANCED DEVICE MODE')}</span>
                        <h2 id="workbench-maintenance-title">{maintenanceButtonLabel(maintenanceAction)}?</h2>
                        <p>{t(maintenanceAction.description)}</p>
                        <div className="workbench__write-warning">
                            {t('This runs unsupported Homebrew code on the connected device. Keep USB and device power stable until the operation finishes.')}
                            {maintenanceAction.endsSession ? ` ${t('The current MiniDisc session will disconnect afterward.')}` : ''}
                        </div>
                        {maintenanceAction.confirmationToken ? (
                            <label>
                                {language === 'zh-CN' ? `输入 ${maintenanceAction.confirmationToken} 以继续` : `Type ${maintenanceAction.confirmationToken} to continue`}
                                <input autoFocus value={maintenanceConfirmation} onChange={(event) => setMaintenanceConfirmation(event.target.value)} />
                            </label>
                        ) : null}
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={closeMaintenanceReview} disabled={busy}>{t('Cancel')}</button>
                            <button
                                className={maintenanceAction.endsSession ? 'danger-button' : 'primary-button'}
                                onClick={() => void runAdvancedMaintenance()}
                                disabled={busy || !isAdvancedMaintenanceConfirmationValid(maintenanceAction, maintenanceConfirmation)}
                            >
                                {t(busy ? 'Applying…' : 'Apply device mode')}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {rawTocReview ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={closeRawTocReview}>
                    <section className="workbench__modal workbench__maintenance-modal" role="dialog" aria-modal="true" aria-labelledby="workbench-raw-toc-title" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">{t('RAW TOC RESTORE')}</span>
                        <h2 id="workbench-raw-toc-title">{language === 'zh-CN' ? `写入 ${rawTocReview.sourceName}？` : `Write ${rawTocReview.sourceName}?`}</h2>
                        <p>{language === 'zh-CN' ? `文件大小正好为 ${rawTocReview.source.byteLength.toLocaleString()} 字节。设备将写入扇区 0–${RAW_TOC_WRITABLE_SECTOR_COUNT - 1}；扇区 4–5 保留为参考数据。` : `The file is exactly ${rawTocReview.source.byteLength.toLocaleString()} bytes. The device will write sectors 0–${RAW_TOC_WRITABLE_SECTOR_COUNT - 1}; sectors 4–5 remain reference data.`}</p>
                        <dl className="workbench__review-grid">
                            <div><dt>{t('Current disc SHA-256')}</dt><dd>{rawTocReview.preview.currentSha256}</dd></div>
                            <div><dt>{t('Backup SHA-256')}</dt><dd>{rawTocReview.preview.proposedSha256}</dd></div>
                            <div><dt>{t('Current writable sectors')}</dt><dd>{rawTocReview.preview.currentWritableSha256}</dd></div>
                            <div><dt>{t('Backup writable sectors')}</dt><dd>{rawTocReview.preview.proposedWritableSha256}</dd></div>
                            <div><dt>{t('Writable bytes changed')}</dt><dd>{rawTocReview.preview.changedWritableBytes.toLocaleString()}</dd></div>
                            <div><dt>{t('Writable sectors changed')}</dt><dd>{rawTocReview.preview.changedWritableSectors.join(', ') || t('None')}</dd></div>
                        </dl>
                        <div className="workbench__write-warning">
                            {t('A malformed or wrong-disc TOC can make every track unreadable. Keep USB and device power stable until the disc refresh completes.')}
                        </div>
                        {rawTocReview.preview.changedWritableBytes === 0 ? (
                            <div className="workbench__tools-empty"><CheckCircleRoundedIcon /> {t('The writable sectors already match. No write is needed.')}</div>
                        ) : (
                            <label>
                                {language === 'zh-CN' ? `输入 ${RAW_TOC_CONFIRMATION} 以继续` : `Type ${RAW_TOC_CONFIRMATION} to continue`}
                                <input autoFocus value={rawTocConfirmation} onChange={(event) => setRawTocConfirmation(event.target.value)} />
                            </label>
                        )}
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={closeRawTocReview} disabled={busy}>{t('Cancel')}</button>
                            <button
                                className="danger-button"
                                onClick={() => void writeRawToc()}
                                disabled={busy || rawTocReview.preview.changedWritableBytes === 0 || !isRawTocConfirmationValid(rawTocConfirmation)}
                            >
                                {t(busy ? 'Writing…' : 'Write reviewed TOC')}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {rawTocPatchReview ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={closeRawTocPatchReview}>
                    <section className="workbench__modal workbench__maintenance-modal" role="dialog" aria-modal="true" aria-labelledby="workbench-toc-patch-title" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">{t('RAW TOC FLAG CHANGE')}</span>
                        <h2 id="workbench-toc-patch-title">{t(rawTocPatchReview.action.label)}?</h2>
                        <p>{t(rawTocPatchReview.action.description)}</p>
                        <dl className="workbench__review-grid">
                            <div><dt>{t('Tracks on disc')}</dt><dd>{rawTocPatchReview.preview.totalTracks}</dd></div>
                            <div><dt>{t('Tracks changed')}</dt><dd>{rawTocPatchReview.preview.changedTracks}</dd></div>
                            <div><dt>{t('Fragments changed')}</dt><dd>{rawTocPatchReview.preview.changedFragments}</dd></div>
                            <div><dt>{t('Current TOC')}</dt><dd>{rawTocPatchReview.preview.currentSha256}</dd></div>
                            <div><dt>{t('Current writable sectors')}</dt><dd>{rawTocPatchReview.preview.currentWritableSha256}</dd></div>
                            <div><dt>{t('Proposed writable sectors')}</dt><dd>{rawTocPatchReview.preview.proposedWritableSha256}</dd></div>
                        </dl>
                        <div className="workbench__write-warning">
                            {t('This writes raw TOC flag bits on the inserted disc. Keep USB and device power stable until the disc refresh completes.')}
                        </div>
                        {rawTocPatchReview.preview.changedFragments === 0 ? (
                            <div className="workbench__tools-empty"><CheckCircleRoundedIcon /> {t('This change is already applied. No write is needed.')}</div>
                        ) : (
                            <label>
                                {language === 'zh-CN' ? `输入 ${rawTocPatchReview.action.confirmation} 以继续` : `Type ${rawTocPatchReview.action.confirmation} to continue`}
                                <input autoFocus value={rawTocPatchConfirmation} onChange={(event) => setRawTocPatchConfirmation(event.target.value)} />
                            </label>
                        )}
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={closeRawTocPatchReview} disabled={busy}>{t('Cancel')}</button>
                            <button
                                className="danger-button"
                                onClick={() => void applyRawTocPatch()}
                                disabled={busy || rawTocPatchReview.preview.changedFragments === 0 || !isRawTocPatchConfirmationValid(rawTocPatchReview.action, rawTocPatchConfirmation)}
                            >
                                {t(busy ? 'Applying…' : 'Apply reviewed change')}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
            <WorkbenchTocEditor open={tocEditorOpen} onClose={() => setTocEditorOpen(false)} onMessage={onMessage} />
        </section>
    );
};
