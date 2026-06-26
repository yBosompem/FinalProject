export const LEVELS = [100, 200, 300, 400, 500, 600];

export const ACADEMIC_DATA = [
  {
    college: 'College of Agriculture and Natural Resources',
    faculties: [
      {
        name: 'Faculty of Agriculture',
        departments: [
          'Department of Agricultural Economics, Agribusiness and Extension',
          'Department of Animal Science',
          'Department of Horticulture',
          'Department of Crop and Soil Science',
        ],
      },
      {
        name: 'Faculty of Renewable Natural Resources',
        departments: [
          'Department of Agroforestry',
          'Department of Fisheries and Watershed Management',
          'Department of Silviculture and Forest Management',
          'Department of Wildlife and Range Management',
          'Department of Wood Science and Technology',
          'Department of Forest Resources Technology',
        ],
      },
    ],
  },
  {
    college: 'College of Art and Built Environment',
    faculties: [
      {
        name: 'Faculty of Art',
        departments: [
          'Department of Communication Design',
          'Department of Educational Innovations in Science & Technology',
          'Department of Painting and Sculpture',
          'Department of Indigenous Art and Technology',
          'Department of Industrial Art',
          'Department of Publishing Studies',
        ],
      },
      {
        name: 'Faculty of Built Environment',
        departments: [
          'Department of Architecture',
          'Department of Construction Technology and Management',
          'Department of Land Economy',
          'Department of Planning',
        ],
      },
      {
        name: 'Faculty of Educational Studies (FES)',
        departments: [
          'Department of Educational Innovations in Science and Technology (DEIST)',
          'Department of Teacher Education',
        ],
      },
    ],
  },
  {
    college: 'College of Humanities and Social Sciences',
    faculties: [
      {
        name: 'Faculty of Law',
        departments: ['Department of Commercial Law', 'Department of Private Law', 'Department of Public Law'],
      },
      {
        name: 'Faculty of Social Sciences',
        departments: [
          'Department of Economics',
          'Department of English',
          'Department of Geography & Rural Development',
          'Department of History & Political Studies',
          'Department of Modern Languages',
          'Department of Sociology & Social Work',
          'Department of Religious Studies',
        ],
      },
      {
        name: 'School of Business',
        departments: [
          'Department of Accounting and Finance',
          'Department of Supply Chain and Information Systems',
          'Department of Human Resource and Organisational Development',
          'Department of Marketing and Corporate Strategy',
          'Department of Hospitality and Tourism Studies',
        ],
      },
    ],
  },
  {
    college: 'College of Engineering',
    faculties: [
      {
        name: 'Faculty of Civil and Geo-Engineering',
        departments: [
          'Department of Civil Engineering',
          'Department of Geological Engineering',
          'Department of Geomatic Engineering',
          'Department of Petroleum Engineering',
        ],
      },
      {
        name: 'Faculty of Mechanical and Chemical Engineering',
        departments: [
          'Department of Agricultural and Biosystems Engineering',
          'Department of Chemical Engineering',
          'Department of Material Engineering',
          'Department of Mechanical Engineering',
        ],
      },
      {
        name: 'Faculty of Electrical and Computer Engineering',
        departments: [
          'Department of Computer Engineering',
          'Department of Electrical and Electronic Engineering',
          'Department of Telecommunications Engineering',
        ],
      },
    ],
  },
  {
    college: 'College of Health Sciences',
    faculties: [
      {
        name: 'Faculty of Allied Health Sciences',
        departments: ['Department of Nursing', 'Department of Sports and Exercise Science', 'Department of Medical Diagnostics'],
      },
      {
        name: 'School of Medicine and Dentistry',
        departments: [
          'Department of Anaesthesiology & Intensive Care',
          'Department of Anatomy',
          'Department of Behavioural Sciences',
          'Department of Child Health',
          'Department of Clinical Microbiology',
          'Department of Community Health',
          'Department of Eye, Ear, Nose and Throat',
          'Department of Medicine',
          'Department of Molecular Medicine',
          'Department of Obstetrics & Gynaecology',
          'Department of Pathology',
          'Department of Physiology',
          'Department of Radiology',
          'Department of Surgery',
          'Department of Adult Oral Health',
          'Department of Basic Oral Health',
          'Department of Community Dentistry',
          'Department of Oral Health & Orthodontics',
          'Department of Oral & Maxillofacial Science',
        ],
      },
      {
        name: 'Faculty of Pharmacy and Pharmaceutical Sciences',
        departments: [
          'Department of Herbal Medicine',
          'Department of Pharmaceutics',
          'Department of Pharmacology',
          'Department of Pharmacognosy',
          'Department of Pharmaceutical Chemistry',
          'Department of Pharmacy Practice',
        ],
      },
      {
        name: 'School of Public Health',
        departments: [
          'Department of Epidemiology & Biostatistics',
          'Department of Global and International Health',
          'Department of Health Policy, Management & Economics',
          'Department of Health Promotion, Education & Disability',
          'Department of Occupational and Environmental Health',
          'Department of Population, Family and Reproductive Health',
        ],
      },
      {
        name: 'School of Veterinary Medicine',
        departments: [
          'Department of Veterinary Clinical Studies',
          'Department of Veterinary Anatomy and Physiology',
          'Department of Veterinary Pathobiology',
          'Department of Veterinary Pharmacology and Toxicology',
          'Department of Veterinary Public Health and Epidemiology',
        ],
      },
    ],
  },
  {
    college: 'College of Science',
    faculties: [
      {
        name: 'Faculty of Biosciences',
        departments: [
          'Department of Biochemistry and Biotechnology',
          'Department of Environmental Science',
          'Department of Food Science and Technology',
          'Department of Optometry and Visual Science',
          'Department of Theoretical and Applied Biology',
        ],
      },
      {
        name: 'Faculty of Physical Sciences Computational Sciences',
        departments: [
          'Department of Chemistry',
          'Department of Computer Science',
          'Department of Mathematics',
          'Department of Physics',
          'Department of Statistics and Actuarial Science',
          'Department of Meteorology and Climate Science',
        ],
      },
    ],
  },
];

export function getFaculties(college) {
  return ACADEMIC_DATA.find((item) => item.college === college)?.faculties || [];
}

export function getDepartments(college, faculty) {
  return getFaculties(college).find((item) => item.name === faculty)?.departments || [];
}
