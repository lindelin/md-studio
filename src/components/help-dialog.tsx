import React from 'react';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';
import './help-dialog.css';

type HelpDialogProps = {
    open: boolean;
    onClose(): void;
};

export const HelpDialog = ({ open, onClose }: HelpDialogProps) => {
    const { t, language } = useI18n();
    const zh = language === 'zh-CN';
    const desktop = Boolean(window.mdDesktop);

    return (
        <AppDialog open={open} onClose={onClose} title={t('Help & Support')} size="large">
            <div className="help-dialog">
                <section>
                    <h3>{t('Getting started')}</h3>
                    <ol>
                        <li>{t('Connect your recorder and choose the matching connection method.')}</li>
                        <li>{t('Import local audio, then review titles, order, groups and recording modes.')}</li>
                        <li>{t('Review the capacity estimate before starting the write task.')}</li>
                        <li>{zh ? '在任务中心确认写入完成，再断开 USB 或关闭工作室。' : 'Wait for a completed task in Task Center before disconnecting USB or closing Studio.'}</li>
                    </ol>
                </section>

                <section>
                    <h3>{zh ? 'AI 制作、MCP 与 CLI' : 'AI creation, MCP and CLI'}</h3>
                    {desktop ? (
                        <ol>
                            <li>{zh ? '打开侧栏“AI 制作”，开启 MCP，然后复制本机连接地址。' : 'Open AI Creation in the sidebar, enable MCP, then copy the local connection URL.'}</li>
                            <li>{zh ? '把完整地址粘贴到支持本地 HTTP MCP 的 AI 客户端。地址含临时密钥，不要分享；每次重新开启都会生成新地址。' : 'Paste the full URL into an AI client that supports local HTTP MCP. The URL contains a temporary key; do not share it. A new URL is created each time MCP is enabled.'}</li>
                            <li>{zh ? '导出并安装“MD 标签整理 Skill”，让 AI 理解普通标题、全角标题、日文读音和分组规则。' : 'Export and install the MD metadata Skill so the AI understands normal titles, full-width titles, Japanese readings and groups.'}</li>
                            <li>{zh ? '不使用 MCP 时，可复制 CLI 入口。CLI 与界面共用设备、队列和任务状态。' : 'If you do not use MCP, copy the CLI launcher. CLI and the interface share the same device, queue and task state.'}</li>
                        </ol>
                    ) : (
                        <p>{zh ? '网页版可完成本地制盘。AI 接管需要在本机运行项目附带的 MCP 桥接程序；桌面版已将 MCP、CLI 和 Skill 导出集成到“AI 制作”。' : 'The web app can make MDs locally. AI control requires the bundled MCP bridge to run on this computer; the desktop app integrates MCP, CLI and Skill export under AI Creation.'}</p>
                    )}
                    <p>{zh ? '让 AI 先读取工作室状态并整理录制计划，展示曲序、普通标题、全角标题、分组、模式和容量；确认后再写入，并持续查询任务直到设备报告完成。' : 'Have the AI read Studio state and prepare a recording plan first. Review order, normal and full-width titles, groups, mode and capacity before writing, then keep checking the task until the device reports completion.'}</p>
                    <blockquote>{zh ? '把 C:/Music/Album 里的音频按曲序整理，使用 LP2，碟名设为 Album。先给我确认曲目、分组和容量，再开始写盘。' : 'Prepare the audio in C:/Music/Album in track order, use LP2 and name the disc Album. Show me the tracks, groups and capacity before writing.'}</blockquote>
                </section>
                <section>
                    <h3>{zh ? 'MD 文件夹（Group）' : 'MD folders (Groups)'}</h3>
                    <p>{zh ? '碟片曲目上方可新建分组。选择连续且未归组的曲目并命名；点击组名可选中整组，在右侧修改组名。取消分组保留曲目；调整成员时先取消原分组、调整曲序，再重新分组。' : 'Create a group above the disc tracks. Select consecutive ungrouped tracks and name the group. Click a group to select its tracks and rename it in the inspector. Ungroup preserves audio; to change membership, ungroup, reorder, and regroup.'}</p>
                </section>
                <section>
                    <h3>{t('Recording and stopping')}</h3>
                    <p>{t('A track already recording cannot be interrupted safely. End batch stops later tracks from starting, but the current track continues until the recorder finishes it.')}</p>
                    <p>{t('Keep the recorder powered and USB connected while its recording light is flashing.')}</p>
                    <p>{zh ? '如果 USB 断开或碟机掉电，请重新连接并刷新碟片。任务中心会保留已完成数量；核对碟片后只重试剩余曲目。' : 'After USB loss or power failure, reconnect and refresh the disc. Task Center preserves the completed count; verify the disc and retry only the remaining tracks.'}</p>
                </section>

                <section>
                    <h3>{t('USB connection troubleshooting')}</h3>
                    <ul>
                        <li>{t('Close other MiniDisc apps and browser tabs that may be using the recorder.')}</li>
                        <li>{t('Reconnect USB, confirm the recorder has power, then try again.')}</li>
                        <li>{desktop ? (zh ? '在“设置 → 设备驱动”查看 WinUSB 状态；需要时按提示打开集成的 Zadig 安装器。' : 'Check WinUSB under Settings → Device driver; when needed, follow the integrated Zadig installer guidance.') : t('On Windows, the recorder must use a compatible WinUSB driver.')}</li>
                    </ul>
                </section>

                <section>
                    <h3>{t('Local processing')}</h3>
                    <p>{t('Audio conversion, metadata work, device control and automation run on this computer. The hosted web app only delivers static application files.')}</p>
                </section>
            </div>
        </AppDialog>
    );
};
