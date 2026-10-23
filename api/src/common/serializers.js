export const userInclude = {
    settings: true
};
export const diaryInclude = {
    mood: true,
    tags: {
        include: {
            tag: true
        },
        orderBy: [
            {
                tag: {
                    name: 'asc'
                }
            },
            {
                tagId: 'asc'
            }
        ]
    },
    images: {
        orderBy: [
            {
                sortOrder: 'asc'
            },
            {
                id: 'asc'
            }
        ]
    }
};
export const summaryInclude = {
    mood: true,
    tags: diaryInclude.tags,
    _count: {
        select: {
            images: true
        }
    }
};
export function publicUser(user) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        settings: {
            timezone: user.settings.timezone,
            theme: user.settings.theme
        },
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
    };
}
export function publicImage(image) {
    return {
        id: image.id,
        diaryId: image.diaryId,
        originalName: image.originalName,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        sortOrder: image.sortOrder,
        contentUrl: `/api/v1/diaries/${image.diaryId}/images/${image.id}/content`,
        createdAt: image.createdAt.toISOString()
    };
}
function diaryBase(diary) {
    return {
        id: diary.id,
        title: diary.title,
        diaryDate: diary.diaryDate.toISOString().slice(0, 10),
        status: diary.status,
        mood: diary.mood,
        tags: diary.tags.map(({ tag })=>({
                id: tag.id,
                name: tag.name
            })),
        createdAt: diary.createdAt.toISOString(),
        updatedAt: diary.updatedAt.toISOString()
    };
}
export function publicDiary(diary) {
    return {
        ...diaryBase(diary),
        content: diary.content,
        images: diary.images.map(publicImage)
    };
}
export function publicDiarySummary(diary) {
    return {
        ...diaryBase(diary),
        excerpt: Array.from(diary.content).slice(0, 200).join(''),
        imageCount: diary._count.images
    };
}
export const pagination = (page, limit, total)=>({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
    });
