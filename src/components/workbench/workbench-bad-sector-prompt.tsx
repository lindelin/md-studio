import React, { useState } from 'react';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import type { AdvancedBadSectorDecision } from '../../application/contracts';
import { formatTimeFromSeconds } from '../../utils';
import type { AdvancedBadSectorChoice, AdvancedBadSectorPrompt } from './workbench-advanced-recovery';
import { useI18n } from '../use-i18n';

export const WorkbenchBadSectorPrompt = ({
    prompt,
    onChoose,
}: {
    prompt: AdvancedBadSectorPrompt;
    onChoose(choice: AdvancedBadSectorChoice): void;
}) => {
    const { language, t } = useI18n();
    const [rememberForExport, setRememberForExport] = useState(false);
    const [rememberForSession, setRememberForSession] = useState(false);

    const choose = (decision: AdvancedBadSectorDecision) =>
        onChoose({ decision, rememberForExport, rememberForSession: rememberForExport && rememberForSession });

    return (
        <div className="workbench__modal-backdrop workbench__bad-sector-backdrop" role="presentation">
            <section
                className="workbench__modal workbench__bad-sector-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="workbench-bad-sector-title"
                aria-describedby="workbench-bad-sector-description"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <WarningAmberRoundedIcon className="workbench__bad-sector-icon" />
                <span className="workbench__eyebrow">{t('RECOVERY NEEDS INPUT')}</span>
                <h2 id="workbench-bad-sector-title">{t('A damaged sector could not be read')}</h2>
                <p id="workbench-bad-sector-description">
                    {language === 'zh-CN' ? (
                        <>地址 <strong>{prompt.address}</strong>，此数据块的第 {prompt.count} 个扇区，约在 {formatTimeFromSeconds(prompt.seconds, false)}。请选择当前恢复任务的后续处理方式。</>
                    ) : (
                        <>Address <strong>{prompt.address}</strong>, sector {prompt.count} of this block, around{' '}{formatTimeFromSeconds(prompt.seconds, false)}. Choose how the current recovery task should continue.</>
                    )}
                </p>
                <div className="workbench__bad-sector-options">
                    <label>
                        <input
                            type="checkbox"
                            checked={rememberForExport}
                            onChange={(event) => {
                                setRememberForExport(event.target.checked);
                                if (!event.target.checked) setRememberForSession(false);
                            }}
                        />
                        {t('Apply this choice to later damaged sectors in this export')}
                    </label>
                    <label className={!rememberForExport ? 'is-disabled' : ''}>
                        <input
                            type="checkbox"
                            checked={rememberForSession}
                            disabled={!rememberForExport}
                            onChange={(event) => setRememberForSession(event.target.checked)}
                        />
                        {t('Keep the choice until this device disconnects')}
                    </label>
                </div>
                <div className="workbench__bad-sector-actions">
                    <button className="danger-button" onClick={() => choose('abort')}>{t('Stop export')}</button>
                    <button className="secondary-button" onClick={() => choose('reload')}>{t('Retry block')}</button>
                    <button className="secondary-button" onClick={() => choose('skip')}>{t('Skip sector')}</button>
                    <button className="primary-button" onClick={() => choose('yieldanyway')}>{t('Use damaged data')}</button>
                </div>
            </section>
        </div>
    );
};
