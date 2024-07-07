import React, { useState } from 'react';
import { SettingsData } from '@/types';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface SettingsProps {
    onClose: () => void;
    onSettingsChange: (newSettings: SettingsData) => void;
    settings: SettingsData;
}

const Settings: React.FC<SettingsProps> = ({ onClose, onSettingsChange, settings: initialSettings }) => {
    const [settings, setSettings] = useState<SettingsData>(initialSettings);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setSettings((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value,
        }));
    };

    const handleSave = () => {
        chrome.storage.sync.set({ settings }, () => {
            console.log('Settings saved', settings);
            onSettingsChange(settings);
            onClose();
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl w-96 max-h-[90vh] overflow-y-auto animate-slide-up">
                <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-primary-700">Settings</h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <label className="block">
                        <span className="text-neutral-700">Download Path:</span>
                        <input
                            type="text"
                            name="downloadPath"
                            value={settings.downloadPath}
                            onChange={handleChange}
                            placeholder="e.g., Downloads/Images"
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                    </label>
                    <label className="block">
                        <span className="text-neutral-700">File Name Prefix:</span>
                        <input
                            type="text"
                            name="fileNamePrefix"
                            value={settings.fileNamePrefix}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                    </label>
                    <label className="block">
                        <span className="text-neutral-700">Popup Width:</span>
                        <input
                            type="number"
                            name="popupWidth"
                            value={settings.popupWidth}
                            onChange={handleChange}
                            min="200"
                            max="800"
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                    </label>
                    <label className="block">
                        <span className="text-neutral-700">Popup Height:</span>
                        <input
                            type="number"
                            name="popupHeight"
                            value={settings.popupHeight}
                            onChange={handleChange}
                            min="300"
                            max="1000"
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                    </label>
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            name="showImageCount"
                            checked={settings.showImageCount}
                            onChange={handleChange}
                            className="rounded border-neutral-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                        <span className="ml-2 text-neutral-700">Show Image Count in Popup Icon</span>
                    </label>
                    <label className="block">
                        <span className="text-neutral-700">Minimum Image Size (px):</span>
                        <input
                            type="number"
                            name="minimumImageSize"
                            value={settings.minimumImageSize}
                            onChange={handleChange}
                            min="0"
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                    </label>
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            name="excludeBase64Images"
                            checked={settings.excludeBase64Images}
                            onChange={handleChange}
                            className="rounded border-neutral-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                        <span className="ml-2 text-neutral-700">Exclude Base64 Images</span>
                    </label>
                </div>
                <div className="p-4 border-t border-neutral-200 flex justify-end space-x-4">
                    <button onClick={onClose} className="px-4 py-2 border border-neutral-300 rounded-md text-neutral-700 hover:bg-neutral-50 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
