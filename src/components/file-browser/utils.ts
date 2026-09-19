import { File } from "./browser";

export enum FileType {
    Directory,
    File,
}

export function defaultSorter(a: File, b: File, by: string, asc: boolean){
    const dirSortValue = dirSorter(a, b, by, asc);
    if(dirSortValue) return dirSortValue;

    const ascMultiply = asc ? -1 : 1;
    if(by === 'name') return a.name.localeCompare(b.name) * ascMultiply;

    const aV = a.props?.[by],
          bV = b.props?.[by];
    if(aV === undefined || aV === null || bV === undefined || bV === null) return 0;
    if(typeof aV === 'string' && typeof bV === 'string') {
        return aV.localeCompare(bV) * ascMultiply;
    } else if(typeof aV === 'number' && typeof bV === 'number'){
        return (aV - bV) * ascMultiply;
    }
    return aV.toString().localeCompare(bV.toString()) * ascMultiply;
}

export function dirSorter(a: File, b: File, _by: string, _asc: boolean){
    if(a.type === FileType.Directory && b.type === FileType.File) return -1;
    if(a.type === FileType.File && b.type === FileType.Directory) return 1;
    return 0;
}
