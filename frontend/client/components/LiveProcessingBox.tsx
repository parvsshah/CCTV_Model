import { useEffect, useState } from "react";
import { Users, Activity } from "lucide-react";

interface LiveProcessingBoxProps {
    job: {
        id: string;
        name: string;
        status: string;
        streamUrl: string;
        stats?: {
            maxPeople?: number;
            averagePeople?: number;
            currentMax?: number;
        };
    };
}

function VideoFeed({ job }: LiveProcessingBoxProps) {
    const [imageKey, setImageKey] = useState(Date.now());
    const [error, setError] = useState(false);

    // Refresh image every 500ms for smooth updates
    useEffect(() => {
        const interval = setInterval(() => {
            setImageKey(Date.now());
            setError(false);
        }, 500);

        return () => clearInterval(interval);
    }, []);

    const handleImageError = () => {
        setError(true);
    };

    return (
        <div className="relative rounded-lg overflow-hidden border-2 border-gray-200 shadow-md bg-gray-900">
            {/* Video Stream */}
            <div className="relative aspect-video">
                {!error ? (
                    <img
                        src={`${job.streamUrl}?t=${imageKey}`}
                        alt={`Live stream for ${job.name}`}
                        className="w-full h-full object-contain"
                        onError={handleImageError}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                            <Activity className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                            <p className="text-sm">Waiting for frames...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Overlay Info */}
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-3">
                <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium truncate">{job.name}</span>
                    <div className="flex items-center gap-1 bg-green-500 text-white px-2 py-1 rounded-full text-xs">
                        <Activity className="w-3 h-3" />
                        <span>Live</span>
                    </div>
                </div>
            </div>

            {/* Bottom Stats */}
            {job.stats && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <div className="flex items-center justify-between text-white text-xs">
                        <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span className="font-medium">{job.stats.maxPeople || 0} people</span>
                        </div>
                        {job.stats.currentMax && (
                            <span className="text-gray-300">Max: {job.stats.currentMax}</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function LiveProcessingBox({ jobs }: { jobs: any[] }) {
    // Ensure we always have exactly 4 slots (fill with null if fewer jobs)
    const videoSlots = [...jobs.slice(0, 4)];
    while (videoSlots.length < 4) {
        videoSlots.push(null);
    }

    return (
        <div className="grid grid-cols-2 gap-4">
            {videoSlots.map((job, index) => (
                <div key={job?.id || `empty-${index}`}>
                    {job ? (
                        <VideoFeed job={job} />
                    ) : (
                        <div className="relative rounded-lg overflow-hidden border-2 border-dashed border-gray-300 shadow-sm bg-gray-50 aspect-video">
                            <div className="flex items-center justify-center h-full text-gray-400">
                                <div className="text-center">
                                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">No stream</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
