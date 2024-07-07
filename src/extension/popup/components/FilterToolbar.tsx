import React, { useState } from 'react';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { FilterOptions } from '@/types';

interface FilterToolbarProps {
    onFilterChange: (filters: FilterOptions) => void;
}

const FilterToolbar: React.FC<FilterToolbarProps> = ({ onFilterChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filters, setFilters] = useState<FilterOptions>({
        imageType: 'all',
        minWidth: 0,
        minHeight: 0,
        maxFileSize: 0,
        includeBase64: true,
    });

    const handleFilterChange = (key: keyof FilterOptions, value: string | number | boolean) => {
        const newFilters = { ...filters, [key]: key === 'imageType' ? value as string : Number(value) };
        setFilters(newFilters);
        onFilterChange(newFilters);
    };

    return (
        <div className="mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
            >
                {isOpen ? <XMarkIcon className="h-5 w-5 mr-2" /> : <FunnelIcon className="h-5 w-5 mr-2" />}
                {isOpen ? 'Close Filters' : 'Open Filters'}
            </button>

            {isOpen && (
                <div className="mt-4 p-4 bg-white rounded-md shadow-md">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Image Type</label>
                            <select
                                value={filters.imageType}
                                onChange={(e) => handleFilterChange('imageType', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                            >
                                <option value="all">All</option>
                                <option value="jpeg">JPEG</option>
                                <option value="png">PNG</option>
                                <option value="gif">GIF</option>
                                <option value="svg">SVG</option>
                                <option value="webp">WebP</option>
                                <option value="base64">Base64</option>
                                <option value="unknown">Unknown</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Min Width (px)</label>
                            <input
                                type="number"
                                value={filters.minWidth}
                                onChange={(e) => handleFilterChange('minWidth', e.target.value)}
                                min="0"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Min Height (px)</label>
                            <input
                                type="number"
                                value={filters.minHeight}
                                onChange={(e) => handleFilterChange('minHeight', e.target.value)}
                                min="0"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Max File Size (KB)</label>
                            <input
                                type="number"
                                value={filters.maxFileSize}
                                onChange={(e) => handleFilterChange('maxFileSize', e.target.value)}
                                min="0"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                            />
                        </div>

                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                checked={filters.includeBase64}
                                onChange={(e) => handleFilterChange('includeBase64', e.target.checked)}
                                className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                            />
                            <label className="ml-2 block text-sm font-medium text-gray-700">
                                Include Base64 Images
                            </label>
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={() => {
                                const defaultFilters: FilterOptions = {
                                    imageType: 'all',
                                    minWidth: 0,
                                    minHeight: 0,
                                    maxFileSize: 0,
                                    includeBase64: true,
                                };
                                setFilters(defaultFilters);
                                onFilterChange(defaultFilters);
                            }}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors mr-2"
                        >
                            Reset Filters
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
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
