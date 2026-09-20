import React, { useCallback, useEffect, useState } from 'react';
import { CustomParameterInfo, initializeParameters, isAllValid } from '../custom-parameters';
import { Services, type ServiceConstructionInfo } from '../services/interface-service-manager';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';

type ParameterFieldProps = {
    parameter: CustomParameterInfo;
    value: string | number | boolean;
    onChange(value: string | number | boolean): void;
    translate(message: string): string;
};

const customServices = Services.filter((service) => service.customParameters);

const ParameterField = ({ parameter, value, onChange, translate }: ParameterFieldProps) => {
    const label = translate(parameter.userFriendlyName);
    const invalid = parameter.validator ? !parameter.validator(String(value ?? '')) : false;

    if (Array.isArray(parameter.type)) {
        return (
            <label className="app-dialog__field">
                <span>{label}</span>
                <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
                    {parameter.type.map((option) => <option value={option.value} key={option.value}>{translate(option.name)}</option>)}
                </select>
            </label>
        );
    }

    if (parameter.type === 'boolean') {
        return (
            <label className="app-dialog__field--check">
                <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
                <span>{label}</span>
            </label>
        );
    }

    if (parameter.type === 'hostDirPath' || parameter.type === 'hostFilePath') {
        const chooseDirectory = parameter.type === 'hostDirPath';
        return (
            <div className="app-dialog__field">
                <span>{label}</span>
                <div className="app-dialog__path">
                    <button
                        className="app-dialog__button"
                        disabled={!window.native?.openFileHostDialog}
                        onClick={() => {
                            void window.native
                                ?.openFileHostDialog?.([{ name: translate('All files'), extensions: ['*'] }], chooseDirectory)
                                ?.then((selectedPath) => onChange(selectedPath ?? ''));
                        }}
                    >
                        {translate(chooseDirectory ? 'Choose directory' : 'Choose file')}
                    </button>
                    <span className="app-dialog__path-output" title={String(value || '')}>{value || translate('No path selected')}</span>
                </div>
            </div>
        );
    }

    return (
        <label className="app-dialog__field">
            <span>{label}</span>
            <input
                type={parameter.type === 'number' ? 'number' : 'text'}
                value={parameter.type === 'number' ? Number(value ?? 0) : String(value ?? '')}
                aria-invalid={invalid}
                onChange={(event) => onChange(parameter.type === 'number' ? Number(event.target.value) : event.target.value)}
            />
        </label>
    );
};

export const OtherDeviceDialog = ({
    onAdd,
    onClose,
    open,
}: {
    onAdd(info: ServiceConstructionInfo): void | Promise<void>;
    onClose(): void;
    open: boolean;
}) => {
    const { t } = useI18n();
    const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
    const [customParameters, setCustomParameters] = useState(() =>
        initializeParameters(customServices[0]?.customParameters)
    );
    const safeSelectedIndex = customServices[selectedServiceIndex] ? selectedServiceIndex : 0;
    const currentService = customServices[safeSelectedIndex];
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setSelectedServiceIndex(0);
        setCustomParameters(initializeParameters(customServices[0]?.customParameters));
        setSaveError(null);
    }, [open]);

    const handleClose = useCallback(() => {
        setSaveError(null);
        onClose();
    }, [onClose]);

    const handleAdd = useCallback(() => {
        if (!currentService || !isAllValid(currentService.customParameters, customParameters)) return;
        setSaveError(null);
        void Promise.resolve(onAdd({ id: currentService.id, name: currentService.name, parameters: customParameters }))
            .then(onClose)
            .catch((error) => setSaveError(t(error instanceof Error ? error.message : String(error))));
    }, [currentService, customParameters, onAdd, onClose, t]);

    const handleServiceSelectionChanged = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextIndex = Number(event.target.value);
        const nextService = customServices[nextIndex];
        if (!nextService) return;
        setSelectedServiceIndex(nextIndex);
        setCustomParameters(initializeParameters(nextService.customParameters));
    }, []);

    const handleParameterChange = useCallback((varName: string, value: string | number | boolean) => {
        setCustomParameters((current) => ({ ...current, [varName]: value }));
    }, []);

    const addDisabled = !currentService || !isAllValid(currentService.customParameters, customParameters);

    return (
        <AppDialog
            open={open}
            title={t('Add Custom Device')}
            onClose={handleClose}
            dismissOnBackdrop
            actions={
                <>
                    <button onClick={handleClose}>{t('Cancel')}</button>
                    <button className="app-dialog__button--primary" onClick={handleAdd} disabled={addDisabled}>{t('Add')}</button>
                </>
            }
        >
            {saveError ? <p role="alert">{saveError}</p> : null}
            {currentService ? (
                <div className="app-dialog__form">
                    <label className="app-dialog__field">
                        <span>{t('Service')}</span>
                        <select value={safeSelectedIndex} onChange={handleServiceSelectionChanged}>
                            {customServices.map((service, index) => <option value={index} key={service.id}>{service.name}</option>)}
                        </select>
                    </label>
                    {currentService.catalogDescription ? <p className="app-dialog__service-description">{t(currentService.catalogDescription)}</p> : null}
                    {currentService.customParameters?.map((parameter) => (
                        <ParameterField
                            key={parameter.varName}
                            parameter={parameter}
                            value={customParameters[parameter.varName]}
                            onChange={(value) => handleParameterChange(parameter.varName, value)}
                            translate={t}
                        />
                    ))}
                </div>
            ) : <p role="alert">{t('No supported service is available.')}</p>}
        </AppDialog>
    );
};
