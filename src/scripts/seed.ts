import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import logger from '../config/logger';

async function seedDatabase() {
  try {
    logger.info('🌱 Starting database seeding...');

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { email: 'admin@ignite.edu' },
    });

    if (existingAdmin) {
      logger.info('Admin user already exists, skipping seeding');
      return;
    }

    // Create brigades
    const brigades = [
      { name: 'Alpha Brigade' },
      { name: 'Beta Brigade' },
      { name: 'Gamma Brigade' },
      { name: 'Delta Brigade' },
      { name: 'Epsilon Brigade' },
    ];

    logger.info('Creating brigades...');
    const createdBrigades = await Promise.all(
      brigades.map(brigade =>
        prisma.brigade.create({
          data: brigade,
        })
      )
    );

    // Create admin user
    logger.info('Creating admin user...');
    const hashedAdminPassword = await bcrypt.hash('admin123', 12);
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@ignite.edu',
        name: 'Admin User',
        password: hashedAdminPassword,
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Create sample students
    logger.info('Creating sample students...');
    const students = [
      { rollNumber: 'CS2021001', name: 'John Doe', brigadeIndex: 0 },
      { rollNumber: 'CS2021002', name: 'Jane Smith', brigadeIndex: 1 },
      { rollNumber: 'CS2021003', name: 'Mike Johnson', brigadeIndex: 2 },
      { rollNumber: 'CS2021004', name: 'Sarah Wilson', brigadeIndex: 3 },
      { rollNumber: 'CS2021005', name: 'David Brown', brigadeIndex: 4 },
      { rollNumber: 'CS2021006', name: 'Emily Davis', brigadeIndex: 0 },
      { rollNumber: 'CS2021007', name: 'Chris Miller', brigadeIndex: 1 },
      { rollNumber: 'CS2021008', name: 'Lisa Garcia', brigadeIndex: 2 },
      { rollNumber: 'CS2021009', name: 'Tom Anderson', brigadeIndex: 3 },
      { rollNumber: 'CS2021010', name: 'Amy Taylor', brigadeIndex: 4 },
    ];

    const hashedStudentPassword = await bcrypt.hash('student123', 12);

    const createdStudents = await Promise.all(
      students.map(student =>
        prisma.user.create({
          data: {
            email: `${student.rollNumber}@student.ignite.edu`,
            rollNumber: student.rollNumber,
            name: student.name,
            password: hashedStudentPassword,
            role: 'STUDENT',
            brigadeId: createdBrigades[student.brigadeIndex].id,
            brigadeName: createdBrigades[student.brigadeIndex].name,
            isActive: true,
          },
        })
      )
    );

    // Create sample event
    logger.info('Creating sample event...');
    const event = await prisma.event.create({
      data: {
        name: 'Ignite 2024 - Fresher Orientation',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        createdBy: adminUser.id,
        isActive: true,
      },
    });

    // Create sample event plans
    logger.info('Creating sample event plans...');
    const eventPlans = [
      {
        title: 'Morning Assembly',
        description: 'Welcome session for all freshers with college introduction and brigade formation',
        date: new Date(),
        time: '09:00 AM',
        endTime: '10:00 AM',
        associatedEventId: event.id,
        planType: 'withoutSubmission' as const,
        createdBy: adminUser.id,
        isActive: true,
      },
      {
        title: 'Ice Breaker Activities',
        description: 'Fun activities to help students get to know each other within their brigades',
        date: new Date(),
        time: '10:30 AM',
        endTime: '12:00 PM',
        associatedEventId: event.id,
        planType: 'withSubmission' as const,
        submissionType: 'file' as const,
        fileSizeLimit: 5,
        createdBy: adminUser.id,
        isActive: true,
      },
      {
        title: 'Leadership Workshop',
        description: 'Interactive workshop on leadership skills and team building exercises',
        date: new Date(),
        time: '02:00 PM',
        endTime: '04:00 PM',
        associatedEventId: event.id,
        planType: 'withSubmission' as const,
        submissionType: 'text' as const,
        createdBy: adminUser.id,
        isActive: true,
      },
      {
        title: 'Cultural Performance',
        description: 'Showcase of talents and cultural performances by students',
        date: new Date(),
        time: '04:30 PM',
        endTime: '06:00 PM',
        associatedEventId: event.id,
        planType: 'withoutSubmission' as const,
        createdBy: adminUser.id,
        isActive: true,
      },
    ];

    await Promise.all(
      eventPlans.map(plan =>
        prisma.eventPlan.create({
          data: plan,
        })
      )
    );

    logger.info('✅ Database seeding completed successfully!');
    logger.info('📧 Admin login: admin@ignite.edu / admin123');
    logger.info('🎓 Student login example: CS2021001 / student123');

  } catch (error) {
    logger.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
}

export default seedDatabase;