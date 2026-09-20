import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServiceCatalog } from '../src/application/service-catalog.ts';

describe('service catalog', () => {
    it('removes constructors and validators while retaining serializable configuration metadata', () => {
        const catalog = createServiceCatalog(
            [
                {
                    id: 'encoder',
                    name: 'Encoder',
                    available: false,
                    unavailableReason: 'Not bundled',
                    customParameters: [
                        {
                            userFriendlyName: 'Mode',
                            varName: 'mode',
                            type: [
                                { name: 'Fast', value: 'fast' },
                                { name: 'Quality', value: 'quality' },
                            ],
                            validator: () => true,
                        },
                    ],
                },
            ],
            [
                {
                    id: 'library',
                    name: 'Library',
                    customParameters: [
                        { userFriendlyName: 'Address', varName: 'address', type: 'string', defaultValue: 'https://example.test/' },
                    ],
                },
            ],
            [
                {
                    id: 'usb-device',
                    name: 'USB Device',
                    catalogDescription: 'Connect to a device through browser USB.',
                    requiresChrome: true,
                },
            ]
        );

        assert.deepEqual(catalog.audioEncoders[0], {
            index: 0,
            id: 'encoder',
            name: 'Encoder',
            available: false,
            unavailableReason: 'Not bundled',
            parameters: [
                {
                    key: 'mode',
                    label: 'Mode',
                    type: 'enum',
                    defaultValue: 'fast',
                    options: [
                        { label: 'Fast', value: 'fast' },
                        { label: 'Quality', value: 'quality' },
                    ],
                },
            ],
        });
        assert.deepEqual(catalog.devices[0], {
            index: 0,
            id: 'usb-device',
            name: 'USB Device',
            description: 'Connect to a device through browser USB.',
            available: true,
            requiresBrowserUsb: true,
            parameters: [],
        });
        assert.equal(catalog.libraries[0].id, 'library');
        assert.doesNotThrow(() => JSON.stringify(catalog));
    });
});
