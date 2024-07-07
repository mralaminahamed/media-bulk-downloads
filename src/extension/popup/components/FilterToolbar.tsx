import React, { useState } from 'react';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { FilterOptions, SettingsData } from '@/types';

interface FilterToolbarProps {
    onFilterChange: (filters: FilterOptions) => void;
    extensionSettings: SettingsData;
}

const FilterToolbar: React.FC<FilterToolbarProps> = ({ onFilterChange, extensionSettings }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filters, setFilters] = useState<FilterOptions>({
        imageType: 'all',
        minSize: 0,
        includeBase64: true,
    });

    const handleFilterChange = (key: keyof FilterOptions, value: string | number | boolean) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        onFilterChange(newFilters);
    };

    const resetFilters = () => {
        const defaultFilters: FilterOptions = {
            imageType: 'all',
            minSize: 0,
            includeBase64: true,
        };
        setFilters(defaultFilters);
        onFilterChange(defaultFilters);
    };

    return (
        <div className="mb-4">
            <button onClick={() => setIsOpen(!isOpen)} className="flex items-center px-3 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors">
                {isOpen ? <XMarkIcon className="h-4 w-4 mr-2" /> : <FunnelIcon className="h-4 w-4 mr-2" />}
                {isOpen ? 'Close Filters' : 'Filter Images'}
            </button>

            {isOpen && (
                <div className="mt-3 p-4 bg-white rounded-md shadow-md">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Image Type</label>
                            <select
                                value={filters.imageType}
                                onChange={(e) => handleFilterChange('imageType', e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                            >
                                <option value="all">All Types</option>
                                <option value="jpeg">JPEG</option>
                                <option value="png">PNG</option>
                                <option value="gif">GIF</option>
                                <option value="svg">SVG</option>
                                <option value="webp">WebP</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Size (KB)</label>
                            <input
                                type="number"
                                value={filters.minSize}
                                onChange={(e) => handleFilterChange('minSize', parseInt(e.target.value))}
                                min="0"
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                            />
                        </div>

                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="includeBase64"
                                checked={filters.includeBase64}
                                disabled={extensionSettings.excludeBase64Images}
                                onChange={(e) => handleFilterChange('includeBase64', e.target.checked)}
                                className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <label htmlFor="includeBase64" className="ml-2 block text-sm text-gray-700">
                                Include Base64 Images
                            </label>
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={resetFilters}
                            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors mr-2"
                        >
                            Reset
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="px-3 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FilterToolbar;
