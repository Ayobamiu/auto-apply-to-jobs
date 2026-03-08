/**
 * Core interfaces for the JSON Resume Standard
 * Based on https://jsonresume.org/schema/
 */

export interface Resume {
    $schema?: string;
    basics: Basics;
    work?: Work[];
    volunteer?: Volunteer[];
    education?: Education[];
    awards?: Award[];
    publications?: Publication[];
    skills?: Skill[];
    languages?: Language[];
    interests?: Interest[];
    references?: Reference[];
    projects?: Project[];
    meta?: Meta;
}

export interface Basics {
    name: string;
    label?: string;
    image?: string;
    email: string;
    phone?: string;
    url?: string;
    summary?: string;
    location?: Location;
    profiles?: Profile[];
}

export interface Location {
    address?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
    region?: string;
}

export interface Profile {
    network: string;
    username: string;
    url: string;
}

export interface Work {
    name: string;
    position: string;
    url?: string;
    startDate: string;
    endDate?: string; // e.g., "2025-09" or "Present"
    summary?: string;
    highlights: string[];
}

export interface Volunteer {
    organization: string;
    position: string;
    url?: string;
    startDate: string;
    endDate?: string;
    summary?: string;
    highlights?: string[];
}

export interface Education {
    institution: string;
    url?: string;
    area: string;
    studyType?: string;
    startDate: string;
    endDate?: string;
    score?: string;
    courses?: string[];
}

export interface Award {
    title: string;
    date: string;
    awarder: string;
    summary?: string;
}

export interface Publication {
    name: string;
    publisher: string;
    releaseDate: string;
    url?: string;
    summary?: string;
}

export interface Skill {
    name: string;
    level?: string;
    keywords: string[];
}

export interface Language {
    language: string;
    fluency: string;
}

export interface Interest {
    name: string;
    keywords: string[];
}

export interface Reference {
    name: string;
    reference: string;
}

export interface Project {
    name: string;
    description?: string;
    highlights: string[];
    keywords?: string[];
    startDate?: string;
    endDate?: string;
    url?: string;
    roles?: string[];
    entity?: string;
    type?: string;
}

export interface Meta {
    canonical?: string;
    version?: string;
    lastModified?: string;
    theme?: string;
}